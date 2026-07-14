import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { TransferService } from '@acquis/hedera-service';
import * as StripeService from '../services/stripe';
import { calculateReward } from '../utils/calculateReward';

// merchantId = 'default' is the platform-wide fallback row.
// Pass a specific merchantId once FundingRequest gains that field.
async function getMerchantRewardRateBps(prisma: PrismaClient, merchantId = 'default'): Promise<number> {
  const config = await prisma.merchantConfig.findUnique({ where: { merchantId } });
  return config?.rewardRateBps ?? parseInt(process.env.ACQUIS_REWARD_RATE_BPS ?? '100', 10);
}

interface FundBody {
  bankAccountId: string;
  hederaAccountId: string;
  amountCents: number;
}

export async function fundRoutes(app: FastifyInstance) {
  // Initiate ACH pull from a linked bank account → credits Hedera wallet after settlement
  app.post<{ Body: FundBody }>('/fund', async (request, reply) => {
    const { bankAccountId, hederaAccountId, amountCents } = request.body;

    if (!bankAccountId || !hederaAccountId || !amountCents || amountCents <= 0) {
      return reply.status(400).send({
        statusCode: 400, error: 'Bad Request',
        message: 'bankAccountId, hederaAccountId, and a positive amountCents are required',
      });
    }

    if (!app.dbReady) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });
    }

    const bankAccount = await app.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, hederaAccountId, status: 'active' },
    });

    if (!bankAccount) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Bank account not found' });
    }

    if (!bankAccount.stripeCustomerId || !bankAccount.stripeSourceId) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Payment processor not configured for this account' });
    }

    try {
      const fundingRequest = await app.prisma.fundingRequest.create({
        data: { bankAccountId, hederaAccountId, amountCents, status: 'processing' },
      });

      const { chargeId } = await StripeService.initiateACHCharge(
        bankAccount.stripeCustomerId,
        bankAccount.stripeSourceId,
        amountCents,
        { fundingRequestId: fundingRequest.id, hederaAccountId },
      );

      await app.prisma.fundingRequest.update({
        where: { id: fundingRequest.id },
        data: { stripePaymentId: chargeId },
      });

      return reply.status(202).send({
        fundingRequestId: fundingRequest.id,
        status: 'processing',
        amountCents,
      });
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Failed to initiate funding' });
    }
  });

  // Stripe webhook — no x-api-key required; verified by Stripe-Signature header
  app.post('/fund/webhook', async (request: FastifyRequest, reply) => {
    const sig = request.headers['stripe-signature'];
    if (typeof sig !== 'string') {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Missing stripe-signature header' });
    }

    let event: ReturnType<typeof StripeService.constructWebhookEvent>;
    try {
      const rawBody = (request as FastifyRequest & { rawBody: Buffer }).rawBody;
      event = StripeService.constructWebhookEvent(rawBody, sig);
    } catch (err) {
      app.log.warn({ err }, 'Stripe webhook signature verification failed');
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid webhook signature' });
    }

    if (!app.dbReady) return reply.status(200).send({ received: true });

    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as { id: string; metadata: Record<string, string> };
      const { fundingRequestId, hederaAccountId } = charge.metadata ?? {};

      if (fundingRequestId && hederaAccountId) {
        const req = await app.prisma.fundingRequest.findUnique({ where: { id: fundingRequestId } });

        if (req && req.status === 'processing') {
          const operatorId = process.env.HEDERA_OPERATOR_ID;
          const operatorKey = process.env.HEDERA_OPERATOR_KEY;
          const tokenId = process.env.HEDERA_DEFAULT_TOKEN_ID;

          if (operatorId && operatorKey && tokenId) {
            try {
              const rateBps = await getMerchantRewardRateBps(app.prisma);
              const reward = calculateReward({ amountCents: req.amountCents, rateBps });
              if (!reward.isZero) {
                await TransferService.transferToken(tokenId, operatorId, operatorKey, hederaAccountId, reward.rewardUnits);
              } else {
                app.log.info({ fundingRequestId, amountCents: req.amountCents, rateBps }, 'AQS reward floored to zero — transfer skipped');
              }
              await app.prisma.fundingRequest.update({
                where: { id: fundingRequestId },
                data: { status: 'settled', stripePaymentId: charge.id },
              });
            } catch (err) {
              app.log.error({ err, fundingRequestId }, 'Hedera credit failed after ACH settlement');
              await app.prisma.fundingRequest.update({
                where: { id: fundingRequestId },
                data: { status: 'credit_failed', error: err instanceof Error ? err.message : String(err) },
              });
            }
          }
        }
      }
    }

    if (event.type === 'charge.failed') {
      const charge = event.data.object as { failure_message?: string; metadata: Record<string, string> };
      const { fundingRequestId } = charge.metadata ?? {};
      if (fundingRequestId) {
        await app.prisma.fundingRequest.updateMany({
          where: { id: fundingRequestId, status: 'processing' },
          data: { status: 'failed', error: charge.failure_message ?? 'ACH charge failed' },
        });
      }
    }

    return reply.status(200).send({ received: true });
  });
}
