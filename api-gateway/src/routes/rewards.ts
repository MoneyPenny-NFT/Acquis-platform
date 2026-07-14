import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { TransferService, HCSService } from '@acquis/hedera-service';
import { calculateReward } from '../utils/calculateReward';

const HCS_TOPIC = process.env.ACQUIS_HCS_TOPIC ?? '0.0.9342744';
const AQT_TOKEN = process.env.HEDERA_DEFAULT_TOKEN_ID ?? '';

async function getMerchantRateBps(prisma: PrismaClient, merchantId: string): Promise<number> {
  const config = await prisma.merchantConfig.findUnique({
    where: { merchantId },
  });
  if (config) return config.rewardRateBps;
  const fallback = await prisma.merchantConfig.findUnique({ where: { merchantId: 'default' } });
  return fallback?.rewardRateBps ?? parseInt(process.env.ACQUIS_REWARD_RATE_BPS ?? '100', 10);
}

// Per-event fixed-unit caps (platform defaults — merchant configurability is Phase 2)
const EVENT_CAPS: Record<string, number> = {
  checkin:      50,   // 0.50 AQT
  referral:     500,  // 5.00 AQT
  signup_bonus: 100,  // 1.00 AQT
  manual_credit: 10000,
};

interface PreferencesParams { customerId: string }
interface PreferencesBody {
  marketingConsent?: boolean;
  marketingChannels?: string[];
}

interface CreditBody {
  merchantId: string;
  customerId?: string;
  customerContact?: { phone?: string; email?: string };
  eventType: 'purchase' | 'checkin' | 'referral' | 'signup_bonus' | 'manual_credit';
  amountCents?: number;
  fixedRewardUnits?: number;
  externalRef?: string;
  note?: string;
}

interface SummaryParams { merchantId: string }
interface BalanceParams { customerId: string }
interface LookupQuery { phone?: string; email?: string }

export async function rewardsRoutes(app: FastifyInstance) {

  // ── POST /rewards/credit ─────────────────────────────────────────────────
  app.post<{ Body: CreditBody }>('/rewards/credit', async (request, reply) => {
    const { merchantId, customerId, customerContact, eventType, amountCents,
            fixedRewardUnits, externalRef, note } = request.body;

    if (!merchantId || !eventType) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
        message: 'merchantId and eventType are required' });
    }

    if (!customerId && !customerContact?.phone && !customerContact?.email) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
        message: 'customerId or customerContact (phone or email) is required' });
    }

    if (eventType === 'purchase' && (!amountCents || amountCents <= 0)) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
        message: 'amountCents is required for purchase events' });
    }

    if (!app.dbReady) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable',
        message: 'Database unavailable' });
    }

    // 1. Idempotency check (externalRef per merchant within 24h)
    if (externalRef) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await app.prisma.rewardEvent.findFirst({
        where: { merchantId, externalRef, createdAt: { gte: since } },
      });
      if (existing) {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict',
          message: 'Duplicate externalRef — reward already credited',
          eventId: existing.id });
      }
    }

    // 2. Resolve customer — by acquisId or contact
    let customer = await resolveCustomer(app.prisma, customerId, customerContact);

    // 3. Guest/lazy enrollment: auto-create if not found
    if (!customer) {
      if (!customerContact?.phone && !customerContact?.email) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found',
          message: 'Customer not found. Provide customerContact to auto-enroll.' });
      }
      // Auto-enroll as guest (no consent UI possible here — use default rewards consent)
      customer = await app.prisma.acquisCustomer.create({
        data: {
          phone:                   customerContact?.phone ?? null,
          email:                   customerContact?.email ?? null,
          enrollingMerchantId:     merchantId,
          rewardsConsentGranted:   true,
          rewardsConsentAt:        new Date(),
          kycLevel:                'rewards_only',
        },
      });

      // Write guest enrollment HCS record
      try {
        await HCSService.submitMessage({
          topic_id: HCS_TOPIC,
          message: JSON.stringify({
            type:      'customer.enrolled.guest',
            acquisId:  customer.acquisId,
            merchantId,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch { /* non-fatal */ }
    }

    // 4. Calculate reward units
    let rewardUnits: number;

    if (eventType === 'purchase') {
      const rateBps = await getMerchantRateBps(app.prisma, merchantId);
      const result  = calculateReward({ amountCents: amountCents!, rateBps });
      if (result.isZero) {
        app.log.info({ merchantId, customerId: customer.acquisId, amountCents, rateBps },
          'AQS reward floored to zero — no transfer');
        const zeroEvent = await app.prisma.rewardEvent.create({
          data: { merchantId, customerId: customer.acquisId, eventType,
                  amountCents, rewardUnits: 0, externalRef: externalRef ?? null,
                  note: note ?? null, status: 'zero_guard' },
        });
        return reply.status(200).send({ rewardUnits: 0, rewardDisplay: '0.00 AQT',
          hcsSequenceNumber: null, customerBalance: customer.aqsBalance,
          transactionId: null, eventId: zeroEvent.id });
      }
      rewardUnits = result.rewardUnits;
    } else {
      if (!fixedRewardUnits || fixedRewardUnits <= 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: `fixedRewardUnits is required for ${eventType} events` });
      }
      const cap = EVENT_CAPS[eventType] ?? 10000;
      rewardUnits = Math.min(fixedRewardUnits, cap);
    }

    // 5. Transfer AQT (custodial to operator for rewards_only; direct for full)
    const operatorId  = process.env.HEDERA_OPERATOR_ID ?? '';
    const operatorKey = process.env.HEDERA_OPERATOR_KEY ?? '';
    const tokenId     = AQT_TOKEN || (process.env.HEDERA_DEFAULT_TOKEN_ID ?? '');

    let hederaTxId: string | undefined;
    if (operatorId && operatorKey && tokenId) {
      try {
        await TransferService.transferToken(tokenId, operatorId, operatorKey, operatorId, rewardUnits);
        // TODO: when customer has full KYC and Hedera account, transfer directly to them
      } catch (err) {
        app.log.error({ err }, 'AQT transfer failed — continuing with HCS record');
      }
    }

    // 6. Write HCS reward event
    let hcsSeq: number | undefined;
    let hcsTopic: string | undefined;
    try {
      const hcsResult = await HCSService.submitMessage({
        topic_id: HCS_TOPIC,
        message: JSON.stringify({
          type:        'reward.credited',
          merchantId,
          customerId:  customer.acquisId,
          eventType,
          rewardUnits,
          amountCents: amountCents ?? null,
          externalRef: externalRef ?? null,
          timestamp:   new Date().toISOString(),
        }),
      });
      hcsSeq   = hcsResult.sequence_number;
      hcsTopic = hcsResult.topic_id;
    } catch (err) {
      app.log.error({ err }, 'HCS write failed for reward event');
    }

    // 7. Persist event + update balance
    const newBalance = customer.aqsBalance + rewardUnits;
    const [event] = await Promise.all([
      app.prisma.rewardEvent.create({
        data: {
          merchantId, customerId: customer.acquisId, eventType,
          amountCents:       amountCents ?? null,
          rewardUnits,
          externalRef:       externalRef ?? null,
          hcsSequenceNumber: hcsSeq ?? null,
          hcsTopicId:        hcsTopic ?? null,
          hederaTxId:        hederaTxId ?? null,
          note:              note ?? null,
          status:            'completed',
        },
      }),
      app.prisma.acquisCustomer.update({
        where:  { acquisId: customer.acquisId },
        data:   { aqsBalance: newBalance },
      }),
    ]);

    return reply.status(201).send({
      rewardUnits,
      rewardDisplay:      (rewardUnits / 100).toFixed(2) + ' AQT',
      hcsSequenceNumber:  hcsSeq ?? null,
      customerBalance:    newBalance,
      transactionId:      hederaTxId ?? null,
      eventId:            event.id,
      customerId:         customer.acquisId,
    });
  });

  // ── GET /merchants/:merchantId/rewards/summary ────────────────────────────
  app.get<{ Params: SummaryParams }>('/merchants/:merchantId/rewards/summary',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });

      const { merchantId } = request.params;
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const week  = new Date(today); week.setDate(week.getDate() - 7);
      const month = new Date(today); month.setDate(1);

      const [todayEvents, weekEvents, monthEvents, allCustomers] = await Promise.all([
        app.prisma.rewardEvent.findMany({
          where: { merchantId, status: 'completed', createdAt: { gte: today } },
          select: { rewardUnits: true },
        }),
        app.prisma.rewardEvent.findMany({
          where: { merchantId, status: 'completed', createdAt: { gte: week } },
          select: { rewardUnits: true },
        }),
        app.prisma.rewardEvent.findMany({
          where: { merchantId, status: 'completed', createdAt: { gte: month } },
          select: { rewardUnits: true },
        }),
        app.prisma.acquisCustomer.findMany({
          where: { enrollingMerchantId: merchantId, status: 'active' },
          select: { acquisId: true, aqsBalance: true },
        }),
      ]);

      const sum = (rows: { rewardUnits: number }[]) =>
        rows.reduce((s, r) => s + r.rewardUnits, 0);

      return reply.send({
        merchantId,
        issuedToday:   sum(todayEvents),
        issuedWeek:    sum(weekEvents),
        issuedMonth:   sum(monthEvents),
        activeCustomers: allCustomers.length,
        totalOutstanding: allCustomers.reduce((s, c) => s + c.aqsBalance, 0),
      });
    }
  );

  // ── GET /merchants/:merchantId/rewards/events ─────────────────────────────
  app.get<{ Params: SummaryParams; Querystring: { limit?: string; offset?: string } }>(
    '/merchants/:merchantId/rewards/events',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });

      const { merchantId } = request.params;
      const limit  = Math.min(parseInt(request.query.limit  ?? '50', 10), 200);
      const offset = parseInt(request.query.offset ?? '0', 10);

      const [events, total] = await Promise.all([
        app.prisma.rewardEvent.findMany({
          where: { merchantId },
          orderBy: { createdAt: 'desc' },
          take: limit, skip: offset,
        }),
        app.prisma.rewardEvent.count({ where: { merchantId } }),
      ]);

      return reply.send({ merchantId, total, limit, offset, events });
    }
  );

  // ── GET /customers/lookup?phone=|email= ──────────────────────────────────
  // Resolves a phone/email contact to an acquisId. Returns only { acquisId, displayName }
  // — no balance, consent, or history. Wallet UIs then hit /rewards/balance for detail.
  app.get<{ Querystring: LookupQuery }>('/customers/lookup', async (request, reply) => {
    if (!app.dbReady) return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });

    const { phone, email } = request.query;
    if (!phone && !email) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
        message: 'phone or email query parameter is required' });
    }

    let customer = null;
    if (phone) {
      customer = await app.prisma.acquisCustomer.findUnique({ where: { phone } });
    }
    if (!customer && email) {
      customer = await app.prisma.acquisCustomer.findUnique({ where: { email } });
    }

    if (!customer) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found',
        message: 'Customer not found' });
    }

    return reply.send({
      acquisId:    customer.acquisId,
      displayName: customer.displayName,
    });
  });

  // ── GET /customers/:customerId/rewards/balance ────────────────────────────
  app.get<{ Params: BalanceParams }>('/customers/:customerId/rewards/balance',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });

      const customer = await app.prisma.acquisCustomer.findUnique({
        where: { acquisId: request.params.customerId },
        include: { rewardEvents: { orderBy: { createdAt: 'desc' }, take: 20 } },
      });

      if (!customer) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found',
          message: 'Customer not found' });
      }

      return reply.send({
        acquisId:               customer.acquisId,
        aqsBalance:             customer.aqsBalance,
        balanceDisplay:         (customer.aqsBalance / 100).toFixed(2) + ' AQT',
        kycLevel:               customer.kycLevel,
        tier:                   customer.tier,
        rewardsConsentGranted:  customer.rewardsConsentGranted,
        marketingConsentGranted: customer.marketingConsentGranted,
        marketingConsentChannels: JSON.parse(customer.marketingConsentChannels || '[]') as string[],
        recentEvents: customer.rewardEvents,
      });
    }
  );
  // ── PATCH /customers/:customerId/preferences ──────────────────────────────
  // Updates marketing consent preferences. Rewards consent is immutable after enrollment.
  // No sends are triggered — OFFERS_SENDING_ENABLED is disabled platform-wide.
  app.patch<{ Params: PreferencesParams; Body: PreferencesBody }>(
    '/customers/:customerId/preferences',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });

      const { customerId } = request.params;
      const { marketingConsent, marketingChannels } = request.body ?? {};

      const customer = await app.prisma.acquisCustomer.findUnique({ where: { acquisId: customerId } });
      if (!customer) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Customer not found' });
      }

      const data: Record<string, unknown> = {};
      if (marketingConsent !== undefined) {
        data.marketingConsentGranted = marketingConsent;
        data.marketingConsentAt = new Date();
      }
      if (marketingChannels !== undefined) {
        data.marketingConsentChannels = JSON.stringify(marketingChannels);
      }

      if (Object.keys(data).length === 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No preferences to update' });
      }

      const updated = await app.prisma.acquisCustomer.update({
        where: { acquisId: customerId },
        data,
      });

      return reply.send({
        acquisId:                updated.acquisId,
        marketingConsentGranted: updated.marketingConsentGranted,
        marketingConsentChannels: JSON.parse(updated.marketingConsentChannels || '[]') as string[],
      });
    },
  );
}

async function resolveCustomer(
  prisma: PrismaClient,
  customerId?: string,
  contact?: { phone?: string; email?: string },
) {
  if (customerId) {
    return prisma.acquisCustomer.findUnique({ where: { acquisId: customerId } });
  }
  if (contact?.phone) {
    const c = await prisma.acquisCustomer.findUnique({ where: { phone: contact.phone } });
    if (c) return c;
  }
  if (contact?.email) {
    const c = await prisma.acquisCustomer.findUnique({ where: { email: contact.email } });
    if (c) return c;
  }
  return null;
}
