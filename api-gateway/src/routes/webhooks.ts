import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { TransferService, HCSService } from '@acquis/hedera-service';
import { calculateReward } from '../utils/calculateReward';

const HCS_TOPIC  = process.env.ACQUIS_HCS_TOPIC          ?? '0.0.9342744';
const AQT_TOKEN  = process.env.HEDERA_DEFAULT_TOKEN_ID    ?? '';
const SQUARE_SIG_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? '';

// Hard ceiling on any single webhook-triggered reward. Protects against
// a compromised secret being used to issue a massive reward credit.
// Default: $5,000. Override with MAX_WEBHOOK_AMOUNT_CENTS in env.
const MAX_WEBHOOK_AMOUNT_CENTS = parseInt(
  process.env.MAX_WEBHOOK_AMOUNT_CENTS ?? '500000', 10,
);

// Reject Square webhooks older than this to block replay attacks.
const SQUARE_MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5 minutes

async function getMerchantRateBps(prisma: any, merchantId: string): Promise<number> {
  const config = await prisma.merchantConfig.findUnique({ where: { merchantId } });
  if (config) return config.rewardRateBps;
  const fallback = await prisma.merchantConfig.findUnique({ where: { merchantId: 'default' } });
  return fallback?.rewardRateBps ?? parseInt(process.env.ACQUIS_REWARD_RATE_BPS ?? '100', 10);
}

// Attempt to credit a reward for a webhook-sourced purchase.
// Returns the rewardEventId on success, null when skipped (zero_guard).
export async function creditWebhookReward(
  app: FastifyInstance,
  { merchantId, customerId, amountCents, externalRef, source }:
  { merchantId: string; customerId: string; amountCents: number; externalRef: string; source: string },
): Promise<string | null> {
  const rateBps = await getMerchantRateBps(app.prisma, merchantId);
  const result  = calculateReward({ amountCents, rateBps });

  if (result.isZero) {
    const ev = await app.prisma.rewardEvent.create({
      data: { merchantId, customerId, eventType: 'purchase', amountCents,
              rewardUnits: 0, externalRef, status: 'zero_guard', note: `via ${source}` },
    });
    return ev.id;
  }

  const operatorId  = process.env.HEDERA_OPERATOR_ID  ?? '';
  const operatorKey = process.env.HEDERA_OPERATOR_KEY ?? '';
  const tokenId     = AQT_TOKEN;

  if (operatorId && operatorKey && tokenId) {
    try {
      await TransferService.transferToken(tokenId, operatorId, operatorKey, operatorId, result.rewardUnits);
    } catch (err) {
      app.log.error({ err }, 'AQT transfer failed in webhook handler');
    }
  }

  let hcsSeq: number | undefined;
  try {
    const hcsResult = await HCSService.submitMessage({
      topic_id: HCS_TOPIC,
      message: JSON.stringify({
        type: 'reward.credited', source, merchantId, customerId,
        eventType: 'purchase', rewardUnits: result.rewardUnits,
        amountCents, externalRef, timestamp: new Date().toISOString(),
      }),
    });
    hcsSeq = hcsResult.sequence_number;
  } catch (err) {
    app.log.error({ err }, 'HCS write failed in webhook handler');
  }

  const ev = await app.prisma.rewardEvent.create({
    data: { merchantId, customerId, eventType: 'purchase', amountCents,
            rewardUnits: result.rewardUnits, externalRef, hcsSequenceNumber: hcsSeq ?? null,
            hcsTopicId: hcsSeq ? HCS_TOPIC : null, status: 'completed', note: `via ${source}` },
  });

  await app.prisma.acquisCustomer.update({
    where: { acquisId: customerId },
    data:  { aqsBalance: { increment: result.rewardUnits } },
  });

  return ev.id;
}

interface WebhookParams { merchantId: string }

export async function webhookRoutes(app: FastifyInstance) {

  // ── POST /webhooks/pos/:merchantId ──────────────────────────────────────
  // Generic endpoint for the Acquis POS terminal or any internal system.
  // Auth: x-webhook-secret header checked against MerchantConfig.webhookSecret
  // for THIS merchant only. A secret for merchant A is rejected on merchant B's path.
  app.post<{
    Params: WebhookParams;
    Body: { amountCents: number; customerContact?: { phone?: string; email?: string }; externalRef?: string };
  }>('/webhooks/pos/:merchantId', async (request, reply) => {
    const { merchantId } = request.params;

    // Auth: look up this merchant's webhook secret and verify it.
    // Fail closed: no config row or null secret = webhook disabled for this merchant.
    const config = await app.prisma.merchantConfig.findUnique({ where: { merchantId } });
    if (!config?.webhookSecret) {
      return reply.status(403).send({ error: 'Webhook not configured for this merchant' });
    }
    const incomingSecret = request.headers['x-webhook-secret'];
    if (typeof incomingSecret !== 'string') {
      return reply.status(401).send({ error: 'Missing x-webhook-secret header' });
    }
    try {
      const a = Buffer.from(incomingSecret);
      const b = Buffer.from(config.webhookSecret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return reply.status(401).send({ error: 'Invalid webhook secret' });
      }
    } catch {
      return reply.status(401).send({ error: 'Invalid webhook secret' });
    }

    const { amountCents, customerContact, externalRef } = request.body;

    if (!amountCents || amountCents <= 0) {
      return reply.status(400).send({ error: 'amountCents is required and must be > 0' });
    }
    if (amountCents > MAX_WEBHOOK_AMOUNT_CENTS) {
      return reply.status(400).send({
        error: `amountCents exceeds maximum allowed per transaction ($${(MAX_WEBHOOK_AMOUNT_CENTS / 100).toFixed(2)})`,
      });
    }
    if (!customerContact?.phone && !customerContact?.email) {
      return reply.status(400).send({ error: 'customerContact.phone or email is required' });
    }

    const ref = externalRef ?? `pos_${Date.now()}`;

    // Idempotency
    const dup = await app.prisma.webhookEvent.findUnique({
      where: { merchantId_externalRef: { merchantId, externalRef: ref } },
    });
    if (dup) {
      return reply.status(200).send({ status: 'duplicate', webhookEventId: dup.id });
    }

    // Log inbound event
    const webhookEv = await app.prisma.webhookEvent.create({
      data: { source: 'pos', merchantId, externalRef: ref, amountCents,
              customerContact: JSON.stringify(customerContact), status: 'customer_not_found' },
    });

    // Resolve customer
    let customer = null;
    if (customerContact.phone) {
      customer = await app.prisma.acquisCustomer.findUnique({ where: { phone: customerContact.phone } });
    }
    if (!customer && customerContact.email) {
      customer = await app.prisma.acquisCustomer.findUnique({ where: { email: customerContact.email } });
    }

    if (!customer) {
      return reply.status(200).send({ status: 'customer_not_found', webhookEventId: webhookEv.id });
    }

    try {
      const rewardEventId = await creditWebhookReward(app, {
        merchantId, customerId: customer.acquisId, amountCents, externalRef: ref, source: 'pos',
      });
      await app.prisma.webhookEvent.update({
        where: { id: webhookEv.id },
        data:  { customerId: customer.acquisId, rewardEventId, status: 'credited' },
      });
      return reply.status(200).send({ status: 'credited', webhookEventId: webhookEv.id, rewardEventId });
    } catch (err: any) {
      await app.prisma.webhookEvent.update({
        where: { id: webhookEv.id },
        data:  { status: 'error', errorMessage: err?.message ?? 'unknown' },
      });
      app.log.error({ err }, 'POS webhook credit failed');
      return reply.status(500).send({ error: 'Internal error processing reward' });
    }
  });

  // ── POST /webhooks/square/:merchantId ───────────────────────────────────
  // Receives Square payment.completed webhooks.
  // Fail-closed: SQUARE_SIG_KEY unset → 503; signature missing → 401; wrong → 401.
  // There is no code path that accepts an unverified request.
  app.post<{ Params: WebhookParams }>(
    '/webhooks/square/:merchantId',
    {},
    async (request, reply) => {
      const { merchantId } = request.params;

      // Fail closed: key not configured means we cannot verify — reject, do not process.
      if (!SQUARE_SIG_KEY) {
        return reply.status(503).send({ error: 'Square webhook signature key not configured on this server' });
      }

      const sig = request.headers['x-square-hmacsha256-signature'];
      if (typeof sig !== 'string' || sig.length === 0) {
        return reply.status(401).send({ error: 'Missing Square signature header' });
      }

      const url      = `${request.protocol}://${request.hostname}${request.url}`;
      const expected = createHmac('sha256', SQUARE_SIG_KEY)
        .update(url + JSON.stringify(request.body))
        .digest('base64');
      try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return reply.status(401).send({ error: 'Invalid Square signature' });
        }
      } catch {
        return reply.status(401).send({ error: 'Invalid Square signature' });
      }

      const payload = request.body as any;
      if (payload?.type !== 'payment.completed') {
        return reply.status(200).send({ status: 'ignored', type: payload?.type });
      }

      // Replay protection: reject events older than 5 minutes.
      const eventCreatedAt = payload?.created_at ? Date.parse(payload.created_at) : NaN;
      if (isNaN(eventCreatedAt) || Date.now() - eventCreatedAt > SQUARE_MAX_EVENT_AGE_MS) {
        return reply.status(400).send({ error: 'Webhook event is too old — possible replay attack' });
      }

      const payment     = payload?.data?.object?.payment;
      const amountCents = payment?.amount_money?.amount;
      const email       = payment?.buyer_email_address as string | undefined;
      const squarePayId = payment?.id as string | undefined;

      if (!amountCents || amountCents <= 0) {
        return reply.status(200).send({ status: 'ignored', reason: 'zero_amount' });
      }
      if (amountCents > MAX_WEBHOOK_AMOUNT_CENTS) {
        return reply.status(400).send({
          error: `amountCents exceeds maximum allowed per transaction ($${(MAX_WEBHOOK_AMOUNT_CENTS / 100).toFixed(2)})`,
        });
      }

      const ref = squarePayId ?? `sq_${Date.now()}`;

      // Idempotency
      const dup = await app.prisma.webhookEvent.findUnique({
        where: { merchantId_externalRef: { merchantId, externalRef: ref } },
      });
      if (dup) {
        return reply.status(200).send({ status: 'duplicate', webhookEventId: dup.id });
      }

      const webhookEv = await app.prisma.webhookEvent.create({
        data: { source: 'square', merchantId, externalRef: ref, amountCents,
                customerContact: email ? JSON.stringify({ email }) : null,
                status: 'customer_not_found' },
      });

      if (!email) {
        return reply.status(200).send({ status: 'customer_not_found',
          reason: 'no_contact_in_payment', webhookEventId: webhookEv.id });
      }

      const customer = await app.prisma.acquisCustomer.findUnique({ where: { email } });
      if (!customer) {
        return reply.status(200).send({ status: 'customer_not_found', webhookEventId: webhookEv.id });
      }

      try {
        const rewardEventId = await creditWebhookReward(app, {
          merchantId, customerId: customer.acquisId, amountCents, externalRef: ref, source: 'square',
        });
        await app.prisma.webhookEvent.update({
          where: { id: webhookEv.id },
          data:  { customerId: customer.acquisId, rewardEventId, status: 'credited' },
        });
        return reply.status(200).send({ status: 'credited', webhookEventId: webhookEv.id, rewardEventId });
      } catch (err: any) {
        await app.prisma.webhookEvent.update({
          where: { id: webhookEv.id },
          data:  { status: 'error', errorMessage: err?.message ?? 'unknown' },
        });
        app.log.error({ err }, 'Square webhook credit failed');
        return reply.status(200).send({ status: 'error', webhookEventId: webhookEv.id });
      }
    },
  );

  // ── GET /merchants/:merchantId/webhooks/events ───────────────────────────
  // Returns recent webhook events for the POS Integration dashboard page.
  app.get<{ Params: WebhookParams; Querystring: { limit?: string; offset?: string } }>(
    '/merchants/:merchantId/webhooks/events',
    async (request, reply) => {
      const { merchantId } = request.params;
      const limit  = Math.min(parseInt(request.query.limit  ?? '50', 10), 200);
      const offset = parseInt(request.query.offset ?? '0', 10);

      const [total, events] = await Promise.all([
        app.prisma.webhookEvent.count({ where: { merchantId } }),
        app.prisma.webhookEvent.findMany({
          where:   { merchantId },
          orderBy: { createdAt: 'desc' },
          take:    limit,
          skip:    offset,
          select:  { id: true, source: true, externalRef: true, amountCents: true,
                     customerContact: true, customerId: true, rewardEventId: true,
                     status: true, errorMessage: true, createdAt: true },
        }),
      ]);

      return reply.send({ merchantId, total, limit, offset, events });
    },
  );
}
