import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { HCSService } from '@acquis/hedera-service';

const HCS_TOPIC = process.env.ACQUIS_HCS_TOPIC ?? '0.0.9342744';

interface MerchantCreateBody {
  slug?:                string;
  legalName:            string;
  dbaName?:             string;
  entityType?:          'llc' | 'c_corp' | 's_corp' | 'sole_prop' | 'partnership';
  ein?:                 string;
  formationState?:      string;
  formationDate?:       string;
  addressLine1?:        string;
  addressLine2?:        string;
  addressCity?:         string;
  addressState?:        string;
  addressPostal?:       string;
  websiteUrl?:          string;
  businessDescription?: string;
  mccCode?:             string;
}

interface MerchantIdParam { merchantId: string }

interface AgreementSignBody {
  agreementText:  string;
  signedByName:   string;
}

// Merchant self-service and admin CRUD, plus the agreement HCS write path.
// The agreement endpoint is plumbing only until MERCHANT_AGREEMENT_ENABLED=true
// AND an attorney has approved the agreement text. See FEATURE_FLAGS.md.
export async function merchantRoutes(app: FastifyInstance) {

  // ── POST /merchants — create ────────────────────────────────────────────
  app.post<{ Body: MerchantCreateBody }>('/merchants', async (request, reply) => {
    if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
    const { legalName } = request.body;
    if (!legalName || legalName.trim().length === 0) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
        message: 'legalName is required' });
    }

    const merchant = await app.prisma.merchant.create({
      data: {
        slug:                request.body.slug ?? null,
        legalName,
        dbaName:             request.body.dbaName ?? null,
        entityType:          request.body.entityType ?? null,
        ein:                 request.body.ein ?? null,
        formationState:      request.body.formationState ?? null,
        formationDate:       request.body.formationDate ? new Date(request.body.formationDate) : null,
        addressLine1:        request.body.addressLine1 ?? null,
        addressLine2:        request.body.addressLine2 ?? null,
        addressCity:         request.body.addressCity ?? null,
        addressState:        request.body.addressState ?? null,
        addressPostal:       request.body.addressPostal ?? null,
        websiteUrl:          request.body.websiteUrl ?? null,
        businessDescription: request.body.businessDescription ?? null,
        mccCode:             request.body.mccCode ?? null,
      },
    });
    return reply.status(201).send(merchant);
  });

  // ── GET /merchants — list ───────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string; offset?: string; status?: string } }>(
    '/merchants',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      const limit  = Math.min(parseInt(request.query.limit  ?? '50', 10), 200);
      const offset = parseInt(request.query.offset ?? '0', 10);
      const where  = request.query.status ? { status: request.query.status } : {};
      const [total, merchants] = await Promise.all([
        app.prisma.merchant.count({ where }),
        app.prisma.merchant.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      ]);
      return reply.send({ total, limit, offset, merchants });
    },
  );

  // ── GET /merchants/:merchantId — fetch ──────────────────────────────────
  app.get<{ Params: MerchantIdParam }>('/merchants/:merchantId', async (request, reply) => {
    if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
    const merchant = await app.prisma.merchant.findUnique({ where: { id: request.params.merchantId } });
    if (!merchant) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Merchant not found' });
    return reply.send(merchant);
  });

  // ── PATCH /merchants/:merchantId — update ───────────────────────────────
  app.patch<{ Params: MerchantIdParam; Body: Partial<MerchantCreateBody> }>(
    '/merchants/:merchantId',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      try {
        const merchant = await app.prisma.merchant.update({
          where: { id: request.params.merchantId },
          data:  {
            ...(request.body.legalName   !== undefined && { legalName: request.body.legalName }),
            ...(request.body.dbaName     !== undefined && { dbaName:   request.body.dbaName }),
            ...(request.body.entityType  !== undefined && { entityType: request.body.entityType }),
            ...(request.body.ein         !== undefined && { ein:       request.body.ein }),
            ...(request.body.formationState !== undefined && { formationState: request.body.formationState }),
            ...(request.body.formationDate  !== undefined && { formationDate: request.body.formationDate ? new Date(request.body.formationDate) : null }),
            ...(request.body.addressLine1 !== undefined && { addressLine1: request.body.addressLine1 }),
            ...(request.body.addressLine2 !== undefined && { addressLine2: request.body.addressLine2 }),
            ...(request.body.addressCity  !== undefined && { addressCity:  request.body.addressCity }),
            ...(request.body.addressState !== undefined && { addressState: request.body.addressState }),
            ...(request.body.addressPostal !== undefined && { addressPostal: request.body.addressPostal }),
            ...(request.body.websiteUrl   !== undefined && { websiteUrl: request.body.websiteUrl }),
            ...(request.body.businessDescription !== undefined && { businessDescription: request.body.businessDescription }),
            ...(request.body.mccCode      !== undefined && { mccCode:   request.body.mccCode }),
          },
        });
        return reply.send(merchant);
      } catch {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Merchant not found' });
      }
    },
  );

  // ── POST /merchants/:merchantId/agreement/sign ─────────────────────────
  // Gated by MERCHANT_AGREEMENT_ENABLED=true. When off, returns 501 with a
  // message naming the attorney-review prerequisite (same shape as KYC).
  // When on, hashes the agreement text (SHA-256) and writes a HCS record
  // for immutable audit — the hash is the on-chain artifact, not the text.
  app.post<{ Params: MerchantIdParam; Body: AgreementSignBody }>(
    '/merchants/:merchantId/agreement/sign',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (process.env.MERCHANT_AGREEMENT_ENABLED !== 'true') {
        return reply.status(501).send({
          statusCode: 501,
          error: 'Not Implemented',
          message: 'Merchant agreement acceptance is not yet enabled. Set MERCHANT_AGREEMENT_ENABLED=true once attorney review of the agreement text is complete.',
        });
      }

      const { agreementText, signedByName } = request.body;
      if (!agreementText || !signedByName) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'agreementText and signedByName are required' });
      }

      const merchant = await app.prisma.merchant.findUnique({ where: { id: request.params.merchantId } });
      if (!merchant) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Merchant not found' });

      const agreementHash = createHash('sha256').update(agreementText, 'utf8').digest('hex');
      const now           = new Date();

      const hcsResult = await HCSService.submitMessage({
        topic_id: HCS_TOPIC,
        message: JSON.stringify({
          type:            'merchant.agreement.signed',
          merchantId:      merchant.id,
          merchantSlug:    merchant.slug,
          legalName:       merchant.legalName,
          agreementHash,
          signedByName,
          signedAt:        now.toISOString(),
        }),
      });

      const updated = await app.prisma.merchant.update({
        where: { id: merchant.id },
        data:  {
          agreementHash,
          agreementSignedAt:     now,
          agreementSignedBy:     signedByName,
          hcsAgreementTopicId:   hcsResult.topic_id,
          hcsAgreementSeqNumber: hcsResult.sequence_number,
          hcsAgreementTxId:      hcsResult.transaction_id,
          status:                merchant.status === 'pending' ? 'agreement_signed' : merchant.status,
        },
      });

      return reply.status(200).send({
        merchantId:            updated.id,
        agreementHash,
        signedAt:              now.toISOString(),
        signedByName,
        hcsTopicId:            hcsResult.topic_id,
        hcsSequenceNumber:     hcsResult.sequence_number,
        hcsTransactionId:      hcsResult.transaction_id,
        status:                updated.status,
      });
    },
  );
}
