import type { FastifyInstance } from 'fastify';
import { TransferService } from '@acquis/hedera-service';
import { executeTestnetPayment, generateDestinationTag, usdCentsToXrp, formatXrp } from '@acquis/xrpl-service';
import { logTransaction } from '../plugins/logTransaction';

interface PayBody {
  toAccountId?: string;
  amount?: number;
  amountCents?: number;
  mode?: 'token' | 'hbar' | 'xrp';
  tokenId?: string;
}

export async function payRoutes(app: FastifyInstance) {
  app.post<{ Body: PayBody }>('/pay', async (request, reply) => {
    const { toAccountId, amount, amountCents, mode = 'token', tokenId } = request.body;

    // XRP mode: uses amountCents and testnet customer → merchant transfer
    if (mode === 'xrp') {
      const cents = amountCents ?? (amount ? Math.round(amount * 100) : 0);
      if (!cents || cents <= 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'amountCents must be a positive integer' });
      }
      const merchantAddress = process.env.XRPL_MERCHANT_ADDRESS;
      const customerSeed = process.env.XRPL_CUSTOMER_SEED;
      const xrpUsdRate = parseFloat(process.env.XRPL_XRP_USD_RATE ?? '2.50');
      if (!merchantAddress || !customerSeed) {
        return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'XRPL credentials not configured' });
      }
      const destinationTag = generateDestinationTag();
      const xrpAmount = usdCentsToXrp(cents, xrpUsdRate);

      if (app.smartnode.isReady()) {
        const validation = await app.smartnode.validatePayment({
          amountCents: cents,
          xrpUsdRate,
          toAddress: merchantAddress,
          destinationTag,
        });
        if (!validation.isValid) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: `SmartNode ruleset rejected payment: ${validation.reason ?? 'policy violation'}`,
            ruleRef: validation.ruleRef,
          });
        }
      }

      const result = await executeTestnetPayment({ amountCents: cents, xrpUsdRate, merchantAddress, customerSeed, destinationTag });
      return reply.send({
        success: true,
        mode,
        txHash: result.txHash,
        ledgerIndex: result.ledgerIndex,
        destinationTag,
        fee: result.fee,
        amountCents: cents,
        xrpAmount: formatXrp(xrpAmount),
        merchantAddress,
        smartnodeValidated: app.smartnode.isReady(),
      });
    }

    if (!toAccountId || !amount || amount <= 0) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'toAccountId and a positive amount are required' });
    }

    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Operator credentials not configured' });
    }

    if (mode === 'hbar') {
      await logTransaction(app, 'pay_hbar', { toAccountId, amount }, () =>
        TransferService.transferHbar(operatorId, operatorKey, toAccountId, amount),
      );
      return reply.send({ success: true, toAccountId, amount, mode });
    }

    const tid = tokenId ?? process.env.HEDERA_DEFAULT_TOKEN_ID;
    if (!tid) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'tokenId is required (or set HEDERA_DEFAULT_TOKEN_ID)' });
    }

    await logTransaction(app, 'pay_token', { toAccountId, amount, tokenId: tid }, () =>
      TransferService.transferToken(tid, operatorId, operatorKey, toAccountId, amount),
    );
    return reply.send({ success: true, toAccountId, amount, mode, tokenId: tid });
  });
}
