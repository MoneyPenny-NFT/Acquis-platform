import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Wallet } from 'xrpl';
import {
  FacilitatorClient,
  XRPLPresignedPaymentPayer,
  encodePaymentRequiredHeader,
} from 'x402-xrpl';
import { TransferService } from '@acquis/hedera-service';
import { executeTestnetPayment, generateDestinationTag, usdCentsToXrp, xrpToDrops, formatXrp, verifyCredential } from '@acquis/xrpl-service';
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

      // ─── X402_ENABLED=false (default) — legacy stub behavior ─────────────
      // Preserved verbatim for backward compatibility with callers that hit
      // /pay?mode=x402 today. Flip X402_ENABLED=true to route through the
      // real x402 facilitator flow below.
      if (process.env.X402_ENABLED !== 'true') {
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
          credentialVerified:   credentialValid?.valid ?? false,
          customerNftTokenId:   credentialValid?.credential?.uri ?? null,
        });
      }

      // ─── X402_ENABLED=true — real x402 protocol via hosted facilitator ───
      // Server-signs the presigned XRPL Payment on behalf of the testnet
      // customer wallet (XRPL_CUSTOMER_SEED), then delegates verify + settle
      // to the configured facilitator instead of submitting to XRPL directly.
      // See FEATURE_FLAGS.md#X402_ENABLED for enable prerequisites.
      const facilitatorUrl = process.env.X402_FACILITATOR_URL;
      if (!facilitatorUrl) {
        return reply.status(503).send({
          statusCode: 503, error: 'Service Unavailable',
          message: 'X402_ENABLED=true but X402_FACILITATOR_URL is not set',
          reason:  'facilitator_not_configured',
        });
      }

      const network = (process.env.X402_NETWORK ?? 'xrpl:1') as 'xrpl:0' | 'xrpl:1' | 'xrpl:2';
      const wsUrl   = process.env.XRPL_WSS_URL ?? 'wss://s.altnet.rippletest.net:51233';
      const amountDrops = xrpToDrops(xrpAmount);

      const paymentRequirements = {
        scheme:            'exact',
        network,
        amount:             amountDrops,
        asset:              'XRP',
        payTo:              merchantAddress,
        maxTimeoutSeconds:  60,
        extra: {
          sourceTag:      804681468,
          invoiceId:      `acquis-${randomUUID()}`,
          destinationTag,
        },
      };

      let paymentHeader: string;
      let paymentPayload: unknown;
      try {
        const wallet = Wallet.fromSeed(customerSeed);
        const payer  = new XRPLPresignedPaymentPayer({ wallet, network, wsUrl });
        const prepared = await payer.preparePayment(paymentRequirements, {
          invoiceId: paymentRequirements.extra.invoiceId,
        });
        paymentHeader  = prepared.paymentHeader;
        paymentPayload = prepared.paymentPayload;
      } catch (err) {
        app.log.error({ err }, 'x402 preparePayment failed');
        return reply.status(500).send({
          statusCode: 500, error: 'Internal Server Error',
          message: 'Failed to prepare x402 presigned payment',
          reason:  'prepare_failed',
        });
      }

      const facilitator = new FacilitatorClient({ baseUrl: facilitatorUrl });

      let verifyResult: { isValid: boolean; invalidReason?: string | null; payer?: string | null };
      try {
        verifyResult = await facilitator.verify({ paymentHeader, paymentRequirements });
      } catch (err) {
        app.log.error({ err, facilitatorUrl }, 'x402 facilitator /verify unreachable');
        return reply.status(502).send({
          statusCode: 502, error: 'Bad Gateway',
          message: 'x402 facilitator /verify unreachable',
          reason:  'facilitator_unreachable',
        });
      }
      if (!verifyResult.isValid) {
        reply.header('PAYMENT-REQUIRED', encodePaymentRequiredHeader({
          x402Version: 2,
          resource: {
            url:         `${request.protocol}://${request.hostname}/api/v1/pay?mode=x402`,
            description: `Acquis testnet payment (${cents} cents)`,
            mimeType:    'application/json',
          },
          accepts: [paymentRequirements],
        }));
        return reply.status(400).send({
          statusCode: 400, error: 'Bad Request',
          message: `x402 facilitator rejected payment: ${verifyResult.invalidReason ?? 'invalid'}`,
          reason:  'payment_verify_failed',
          invalidReason: verifyResult.invalidReason ?? null,
        });
      }

      let settleResult: { success: boolean; transaction: string; network: string; payer?: string | null; errorReason?: string | null };
      try {
        settleResult = await facilitator.settle({ paymentHeader, paymentRequirements });
      } catch (err) {
        app.log.error({ err, facilitatorUrl }, 'x402 facilitator /settle unreachable');
        return reply.status(502).send({
          statusCode: 502, error: 'Bad Gateway',
          message: 'x402 facilitator /settle unreachable',
          reason:  'facilitator_unreachable',
        });
      }
      if (!settleResult.success) {
        return reply.status(502).send({
          statusCode: 502, error: 'Bad Gateway',
          message: `x402 facilitator failed to settle: ${settleResult.errorReason ?? 'unknown'}`,
          reason:  'settle_failed',
          errorReason: settleResult.errorReason ?? null,
        });
      }

      return reply.send({
        success:            true,
        mode,
        settlementResponse: settleResult,
        paymentRequirements,
        paymentPayload,
        credentialVerified: credentialValid?.valid ?? false,
        customerNftTokenId: credentialValid?.credential?.uri ?? null,
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
