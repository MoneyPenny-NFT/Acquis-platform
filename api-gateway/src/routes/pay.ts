import type { FastifyInstance } from 'fastify';
import { TransferService } from '@acquis/hedera-service';
import { executeTestnetPayment, generateDestinationTag, usdCentsToXrp, formatXrp, verifyCredential } from '@acquis/xrpl-service';
import type { VerifyCredentialResult } from '@acquis/xrpl-service';
import { logTransaction } from '../plugins/logTransaction';
import { runEnforcementCheck } from '../enforcement/stubAdapter';
import type { MerchantCategory } from '@acquis/enforcement-engine';

interface PayBody {
  toAccountId?:        string;
  amount?:             number;
  amountCents?:        number;
  mode?:               'token' | 'hbar' | 'xrp' | 'x402';
  tokenId?:            string;
  customerXrplAddress?: string;
  // Enforcement-engine fields — required when ENFORCEMENT_ENGINE_ENABLED=true
  merchantId?:         string;
  customerId?:         string;         // Acquis ID
  category?:           MerchantCategory;
  isAgentInitiated?:   boolean;
  agentId?:            string;
  x402PaymentAge?:     number;
}

export async function payRoutes(app: FastifyInstance) {
  app.post<{ Body: PayBody }>('/pay', async (request, reply) => {
    const { toAccountId, amount, amountCents, mode = 'token', tokenId, customerXrplAddress,
            merchantId, customerId, category, isAgentInitiated, agentId, x402PaymentAge } = request.body;

    // ─── Enforcement engine pre-check (ENFORCEMENT_ENGINE_ENABLED=false by default) ─
    // Runs BEFORE credential pre-check, BEFORE any settlement logic. Rejects
    // return 403 with failedRules. Adapter today is the stub; when SmartNode
    // /Hooks/smart-contract lands the adapter changes but the engine and this
    // integration do not. When the flag is off, this block is completely inert.
    if (process.env.ENFORCEMENT_ENGINE_ENABLED === 'true') {
      if (!merchantId || !customerId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'merchantId and customerId are required when ENFORCEMENT_ENGINE_ENABLED=true' });
      }
      const enforcementCents = amountCents ?? (amount ? Math.round(amount * 100) : 0);
      if (!enforcementCents || enforcementCents <= 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'amountCents or amount must be a positive value for enforcement check' });
      }
      const validation = await runEnforcementCheck({ prisma: app.prisma, log: app.log }, {
        merchantId, customerId, amountCents: enforcementCents,
        category, timestamp: new Date().toISOString(),
        isAgentInitiated: isAgentInitiated ?? false,
        agentId, x402PaymentAge,
      });
      if ('error' in validation && validation.error === 'no_rule_set') {
        return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable',
          message: `No MerchantRuleSet configured for merchant '${merchantId}'. Enforcement engine cannot evaluate.`,
          reason: 'no_rule_set' });
      }
      if ('approved' in validation && !validation.approved) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden',
          message: 'Transaction rejected by merchant rule validation',
          failedRules: validation.failedRules,
          ruleSetVersion: validation.ruleSetVersion,
          onChainProof:  validation.onChainProof ?? null,
        });
      }
    }

    // ─── Credential pre-check (CREDENTIAL_VERIFICATION_ENABLED=false by default) ─
    // 503 when the server is misconfigured; 403 when the credential is
    // genuinely invalid/absent. Distinguishing these matters — a misconfigured
    // prod env would otherwise look identical to legitimate revocation for
    // every customer in triage logs.
    let credentialValid: VerifyCredentialResult | null = null;
    if (process.env.CREDENTIAL_VERIFICATION_ENABLED === 'true' && customerXrplAddress) {
      credentialValid = await verifyCredential({ accountAddress: customerXrplAddress });
      if (!credentialValid.valid) {
        if (credentialValid.reason === 'issuer_not_configured') {
          return reply.status(503).send({
            statusCode: 503,
            error:      'Service Unavailable',
            message:    'Credential verification is enabled but XRPL_CREDENTIAL_ISSUER_ADDRESS is not configured on the server.',
            reason:     'issuer_not_configured',
          });
        }
        return reply.status(403).send({
          statusCode: 403,
          error:      'Forbidden',
          message:    'Account does not hold a valid Acquis membership credential',
          reason:     credentialValid.reason ?? 'not_found',
        });
      }
    }

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

    if (mode === 'x402') {
      const cents = amountCents ?? (amount ? Math.round(amount * 100) : 0);
      if (!cents || cents <= 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'amountCents must be a positive integer' });
      }
      const merchantAddress = process.env.XRPL_MERCHANT_ADDRESS;
      const customerSeed    = process.env.XRPL_CUSTOMER_SEED;
      const xrpUsdRate      = parseFloat(process.env.XRPL_XRP_USD_RATE ?? '2.50');
      if (!merchantAddress || !customerSeed) {
        return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'XRPL credentials not configured' });
      }
      const destinationTag = generateDestinationTag();
      const xrpAmount      = usdCentsToXrp(cents, xrpUsdRate);
      const x402Details = {
        version:        'x402/v1',
        asset:          'XRP',
        network:        'xrpl-testnet',
        payTo:          merchantAddress,
        amount:         formatXrp(xrpAmount),
        amountCents:    cents,
        destinationTag,
        deadline:       new Date(Date.now() + 60_000).toISOString(),
      };
      // TODO: Replace stub verification with real x402-xrpl verifier
      // once xrpl@4.x upgrade is evaluated separately
      const result = await executeTestnetPayment({ amountCents: cents, xrpUsdRate, merchantAddress, customerSeed, destinationTag });
      return reply.send({
        success:            true,
        mode,
        txHash:             result.txHash,
        ledgerIndex:        result.ledgerIndex,
        destinationTag,
        fee:                result.fee,
        amountCents:        cents,
        xrpAmount:          formatXrp(xrpAmount),
        merchantAddress,
        x402Details,
        smartnodeValidated:   false,
        credentialVerified:   credentialValid?.valid ?? false,
        customerNftTokenId:   credentialValid?.credential?.uri ?? null,
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
      return reply.send({ success: true, toAccountId, amount, mode, credentialVerified: credentialValid?.valid ?? false, customerNftTokenId: credentialValid?.credential?.uri ?? null });
    }

    const tid = tokenId ?? process.env.HEDERA_DEFAULT_TOKEN_ID;
    if (!tid) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'tokenId is required (or set HEDERA_DEFAULT_TOKEN_ID)' });
    }

    await logTransaction(app, 'pay_token', { toAccountId, amount, tokenId: tid }, () =>
      TransferService.transferToken(tid, operatorId, operatorKey, toAccountId, amount),
    );
    return reply.send({ success: true, toAccountId, amount, mode, tokenId: tid, credentialVerified: credentialValid?.valid ?? false, customerNftTokenId: credentialValid?.credential?.uri ?? null });
  });
}
