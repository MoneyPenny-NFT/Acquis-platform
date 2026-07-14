import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { HCSService } from '@acquis/hedera-service';

const HCS_TOPIC = process.env.ACQUIS_HCS_TOPIC ?? '0.0.9342744';
const CODE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
// Omit 0/O/1/I to avoid visual confusion when reading codes aloud or handwriting.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  const bytes = randomBytes(8);
  return Array.from({ length: 8 }, (_, i) => CODE_CHARS[bytes[i] % CODE_CHARS.length]).join('');
}

interface RedeemBody {
  acquisId: string;
  merchantId: string;
  redeemUnits: number;
  externalRef?: string;
}

interface ValidateBody {
  code: string;
  merchantId: string;
}

interface RedemptionsParams { acquisId: string }

export async function redeemRoutes(app: FastifyInstance) {

  // ── POST /rewards/redeem ─────────────────────────────────────────────────
  // Deducts balance, mints a single-use 8-char code (24h TTL), writes HCS.
  // Race-safe: the atomic update will throw if balance dropped below redeemUnits
  // between the pre-check and the write (matters on Postgres, harmless on SQLite).
  app.post<{ Body: RedeemBody }>('/rewards/redeem', async (request, reply) => {
    const { acquisId, merchantId, redeemUnits, externalRef } = request.body;

    if (!acquisId || !merchantId) {
      return reply.status(400).send({ message: 'acquisId and merchantId are required' });
    }
    if (!redeemUnits || redeemUnits <= 0 || !Number.isInteger(redeemUnits)) {
      return reply.status(400).send({ message: 'redeemUnits must be a positive integer' });
    }
    if (!app.dbReady) {
      return reply.status(503).send({ error: 'Database unavailable' });
    }

    // Idempotency
    if (externalRef) {
      const existing = await app.prisma.redemptionEvent.findUnique({
        where: { merchantId_externalRef: { merchantId, externalRef } },
      });
      if (existing) {
        return reply.status(409).send({
          message: 'Duplicate externalRef — redemption already issued',
          redemptionEventId: existing.id,
        });
      }
    }

    const customer = await app.prisma.acquisCustomer.findUnique({ where: { acquisId } });
    if (!customer) {
      return reply.status(404).send({ message: 'Customer not found' });
    }
    if (customer.aqsBalance < redeemUnits) {
      return reply.status(400).send({
        message: 'Insufficient balance',
        currentBalance: customer.aqsBalance,
        requested: redeemUnits,
      });
    }

    const redeemDisplay = (redeemUnits / 100).toFixed(2) + ' AQT';
    const valueCents    = redeemUnits; // 1 AQT unit = 1 cent (1:1 redemption rate)

    // Atomic balance deduction — fails if another concurrent call already spent the balance.
    let updatedCustomer: { aqsBalance: number };
    try {
      updatedCustomer = await app.prisma.acquisCustomer.update({
        where: { acquisId, aqsBalance: { gte: redeemUnits } },
        data:  { aqsBalance: { decrement: redeemUnits } },
        select: { aqsBalance: true },
      });
    } catch {
      return reply.status(400).send({ message: 'Insufficient balance' });
    }

    const redemptionEvent = await app.prisma.redemptionEvent.create({
      data: {
        acquisId, merchantId, redeemUnits, redeemDisplay, valueCents,
        externalRef: externalRef ?? null,
        status: 'pending',
      },
    });

    const code      = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    await app.prisma.redemptionCode.create({
      data: { code, redemptionEventId: redemptionEvent.id, expiresAt },
    });

    // Write HCS record — non-fatal on failure; DB is the source of truth.
    let hcsSeq: number | undefined;
    try {
      const hcsResult = await HCSService.submitMessage({
        topic_id: HCS_TOPIC,
        message: JSON.stringify({
          type: 'reward.redeemed', acquisId, merchantId,
          redeemUnits, valueCents, redemptionEventId: redemptionEvent.id,
          expiresAt: expiresAt.toISOString(),
          timestamp: new Date().toISOString(),
        }),
      });
      hcsSeq = hcsResult.sequence_number;
      await app.prisma.redemptionEvent.update({
        where: { id: redemptionEvent.id },
        data:  { hcsSequenceNumber: hcsSeq, hcsTopicId: HCS_TOPIC },
      });
    } catch (err) {
      app.log.error({ err }, 'HCS write failed for redemption event');
    }

    return reply.status(201).send({
      redemptionEventId: redemptionEvent.id,
      code,
      redeemUnits,
      redeemDisplay,
      valueCents,
      expiresAt: expiresAt.toISOString(),
      hcsSequenceNumber: hcsSeq ?? null,
      newBalance: updatedCustomer.aqsBalance,
    });
  });

  // ── POST /rewards/redeem/validate ────────────────────────────────────────
  // Merchant scans/enters the code at point of sale to confirm the redemption.
  app.post<{ Body: ValidateBody }>('/rewards/redeem/validate', async (request, reply) => {
    const { code, merchantId } = request.body;

    if (!code || !merchantId) {
      return reply.status(400).send({ message: 'code and merchantId are required' });
    }
    if (!app.dbReady) {
      return reply.status(503).send({ error: 'Database unavailable' });
    }

    const redemptionCode = await app.prisma.redemptionCode.findUnique({
      where:   { code },
      include: { redemptionEvent: true },
    });

    if (!redemptionCode) {
      return reply.status(404).send({ message: 'Code not found' });
    }
    if (redemptionCode.status === 'used') {
      return reply.status(409).send({ message: 'Code already used', usedAt: redemptionCode.usedAt });
    }
    if (redemptionCode.status === 'expired' || redemptionCode.expiresAt < new Date()) {
      if (redemptionCode.status !== 'expired') {
        await Promise.all([
          app.prisma.redemptionCode.update({
            where: { id: redemptionCode.id },
            data:  { status: 'expired' },
          }),
          app.prisma.redemptionEvent.update({
            where: { id: redemptionCode.redemptionEventId },
            data:  { status: 'expired' },
          }),
        ]);
      }
      return reply.status(410).send({ message: 'Code has expired' });
    }

    const now = new Date();
    await Promise.all([
      app.prisma.redemptionCode.update({
        where: { id: redemptionCode.id },
        data:  { status: 'used', usedAt: now, usedByMerchantId: merchantId },
      }),
      app.prisma.redemptionEvent.update({
        where: { id: redemptionCode.redemptionEventId },
        data:  { status: 'validated' },
      }),
    ]);

    let hcsSeq: number | undefined;
    try {
      const hcsResult = await HCSService.submitMessage({
        topic_id: HCS_TOPIC,
        message: JSON.stringify({
          type: 'redemption.validated', merchantId,
          acquisId:          redemptionCode.redemptionEvent.acquisId,
          redemptionEventId: redemptionCode.redemptionEventId,
          redeemUnits:       redemptionCode.redemptionEvent.redeemUnits,
          valueCents:        redemptionCode.redemptionEvent.valueCents,
          validatedAt:       now.toISOString(),
          timestamp:         now.toISOString(),
        }),
      });
      hcsSeq = hcsResult.sequence_number;
    } catch (err) {
      app.log.error({ err }, 'HCS write failed for redemption validation');
    }

    return reply.send({
      acquisId:          redemptionCode.redemptionEvent.acquisId,
      redemptionEventId: redemptionCode.redemptionEventId,
      redeemUnits:       redemptionCode.redemptionEvent.redeemUnits,
      redeemDisplay:     redemptionCode.redemptionEvent.redeemDisplay,
      valueCents:        redemptionCode.redemptionEvent.valueCents,
      validatedAt:       now.toISOString(),
      hcsSequenceNumber: hcsSeq ?? null,
    });
  });

  // ── GET /customers/:acquisId/redemptions ─────────────────────────────────
  app.get<{ Params: RedemptionsParams; Querystring: { limit?: string; offset?: string } }>(
    '/customers/:acquisId/redemptions',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });

      const { acquisId } = request.params;
      const limit  = Math.min(parseInt(request.query.limit  ?? '50', 10), 200);
      const offset = parseInt(request.query.offset ?? '0', 10);

      const customer = await app.prisma.acquisCustomer.findUnique({ where: { acquisId } });
      if (!customer) return reply.status(404).send({ message: 'Customer not found' });

      const [total, events] = await Promise.all([
        app.prisma.redemptionEvent.count({ where: { acquisId } }),
        app.prisma.redemptionEvent.findMany({
          where:   { acquisId },
          orderBy: { createdAt: 'desc' },
          take:    limit,
          skip:    offset,
          include: { code: { select: { status: true, usedAt: true, expiresAt: true } } },
        }),
      ]);

      return reply.send({ acquisId, total, limit, offset, events });
    },
  );
}
