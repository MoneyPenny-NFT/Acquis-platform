import type { FastifyInstance } from 'fastify';
import { HCSService } from '@acquis/hedera-service';
import type { MerchantRuleSet } from '@acquis/enforcement-engine';

const HCS_TOPIC = process.env.ACQUIS_HCS_TOPIC ?? '0.0.9342744';

interface MerchantIdParam { merchantId: string }

// MerchantRuleSet Component A endpoints. Storage is JSON-in-column;
// version increments per write; every write appends a HCS record.
export async function merchantRuleRoutes(app: FastifyInstance) {

  // ── POST /merchants/:merchantId/rules ─────────────────────────────────
  // Body is the full MerchantRuleSet (minus merchantId/version — server-set).
  app.post<{ Params: MerchantIdParam; Body: Omit<MerchantRuleSet, 'merchantId' | 'version' | 'hcsTopicId'> }>(
    '/merchants/:merchantId/rules',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });

      const merchant = await app.prisma.merchant.findUnique({ where: { id: request.params.merchantId } });
      if (!merchant) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Merchant not found' });

      // Next version number
      const latest = await app.prisma.merchantRuleSet.findFirst({
        where:   { merchantId: request.params.merchantId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const ruleSet: MerchantRuleSet = {
        ...request.body,
        merchantId: request.params.merchantId,
        version:    nextVersion,
        hcsTopicId: HCS_TOPIC,
      };

      // Write HCS FIRST — the DB row references the returned sequence number
      const hcsResult = await HCSService.submitMessage({
        topic_id: HCS_TOPIC,
        message: JSON.stringify({
          type:           'merchant.ruleSet.published',
          merchantId:     ruleSet.merchantId,
          version:        ruleSet.version,
          effectiveAt:    ruleSet.effectiveAt,
          tier:           ruleSet.tier,
          ruleSetSha256:  require('crypto').createHash('sha256').update(JSON.stringify(ruleSet), 'utf8').digest('hex'),
        }),
      });

      const row = await app.prisma.merchantRuleSet.create({
        data: {
          merchantId:        ruleSet.merchantId,
          version:           ruleSet.version,
          hcsTopicId:        HCS_TOPIC,
          hcsSequenceNumber: hcsResult.sequence_number,
          hcsTransactionId:  hcsResult.transaction_id,
          ruleSetJson:       JSON.stringify(ruleSet),
          effectiveAt:       new Date(ruleSet.effectiveAt),
        },
      });

      return reply.status(201).send({
        id:                row.id,
        merchantId:        row.merchantId,
        version:           row.version,
        hcsTopicId:        row.hcsTopicId,
        hcsSequenceNumber: row.hcsSequenceNumber,
        hcsTransactionId:  row.hcsTransactionId,
        effectiveAt:       row.effectiveAt.toISOString(),
        createdAt:         row.createdAt.toISOString(),
      });
    },
  );

  // ── GET /merchants/:merchantId/rules/current ──────────────────────────
  app.get<{ Params: MerchantIdParam }>(
    '/merchants/:merchantId/rules/current',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      const row = await app.prisma.merchantRuleSet.findFirst({
        where:   { merchantId: request.params.merchantId },
        orderBy: { version: 'desc' },
      });
      if (!row) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'No rule set for merchant' });
      return reply.send({
        merchantId:        row.merchantId,
        version:           row.version,
        hcsTopicId:        row.hcsTopicId,
        hcsSequenceNumber: row.hcsSequenceNumber,
        hcsTransactionId:  row.hcsTransactionId,
        effectiveAt:       row.effectiveAt.toISOString(),
        createdAt:         row.createdAt.toISOString(),
        ruleSet:           JSON.parse(row.ruleSetJson),
      });
    },
  );

  // ── GET /merchants/:merchantId/rules/:version ─────────────────────────
  app.get<{ Params: { merchantId: string; version: string } }>(
    '/merchants/:merchantId/rules/:version',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      const version = parseInt(request.params.version, 10);
      if (!Number.isFinite(version)) return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'version must be an integer' });
      const row = await app.prisma.merchantRuleSet.findUnique({
        where: { merchantId_version: { merchantId: request.params.merchantId, version } },
      });
      if (!row) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Rule set version not found' });
      return reply.send({
        merchantId:        row.merchantId,
        version:           row.version,
        hcsTopicId:        row.hcsTopicId,
        hcsSequenceNumber: row.hcsSequenceNumber,
        hcsTransactionId:  row.hcsTransactionId,
        effectiveAt:       row.effectiveAt.toISOString(),
        createdAt:         row.createdAt.toISOString(),
        ruleSet:           JSON.parse(row.ruleSetJson),
      });
    },
  );
}
