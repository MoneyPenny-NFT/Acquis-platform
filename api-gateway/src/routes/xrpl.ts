import type { FastifyInstance } from 'fastify';
import { getAccountInfo, executeTestnetPayment, generateDestinationTag, usdCentsToXrp, formatXrp } from '@acquis/xrpl-service';

interface XrplPayBody {
  amountCents: number;
}

interface XrplAccountParams {
  address: string;
}

export async function xrplRoutes(app: FastifyInstance) {
  app.get<{ Params: XrplAccountParams }>('/xrpl/accounts/:address', async (request, reply) => {
    const { address } = request.params;
    try {
      const info = await getAccountInfo(address);
      return reply.send(info);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Account not found on XRPL testnet',
      });
    }
  });

  app.post<{ Body: XrplPayBody }>('/xrpl/pay', async (request, reply) => {
    const { amountCents } = request.body;

    if (!amountCents || amountCents <= 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'amountCents must be a positive integer',
      });
    }

    const merchantAddress = process.env.XRPL_MERCHANT_ADDRESS;
    const customerSeed = process.env.XRPL_CUSTOMER_SEED;

    if (!merchantAddress || !customerSeed) {
      return reply.status(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'XRPL credentials not configured (XRPL_MERCHANT_ADDRESS, XRPL_CUSTOMER_SEED)',
      });
    }

    const destinationTag = generateDestinationTag();
    const xrpUsdRate = parseFloat(process.env.XRPL_XRP_USD_RATE ?? '2.50');
    const xrpAmount = usdCentsToXrp(amountCents, xrpUsdRate);

    if (app.smartnode.isReady()) {
      const validation = await app.smartnode.validatePayment({
        amountCents,
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

    const result = await executeTestnetPayment({
      amountCents,
      xrpUsdRate,
      merchantAddress,
      customerSeed,
      destinationTag,
    });

    return reply.send({
      success: true,
      txHash: result.txHash,
      ledgerIndex: result.ledgerIndex,
      destinationTag,
      amountCents,
      xrpAmount: formatXrp(xrpAmount),
      merchantAddress,
      fee: result.fee,
      smartnodeValidated: app.smartnode.isReady(),
    });
  });
}
