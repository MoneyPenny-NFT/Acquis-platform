import type { FastifyInstance } from 'fastify';
import { HCSService } from '@acquis/hedera-service';
import { createCredential } from '@acquis/xrpl-service';
import { createSignInPayload, getPayloadStatus, isXummConfigured } from '../services/xumm';
import { CONSENT_TEXT, CONSENT_TEXT_HASH, CONSENT_VERSION } from '../services/enrollmentConsent';

const HCS_TOPIC     = process.env.ACQUIS_HCS_TOPIC ?? '0.0.9342744';
const SESSION_TTL_MS = 90 * 1000; // 90-second QR expiry — deliberately short

// QR-scan enrollment (XRPL-first, Xumm/Xaman wallet).
// Gated by QR_ENROLLMENT_ENABLED — off by default; requires attorney review
// of the consent text (see enrollmentConsent.ts) before flipping.
export async function enrollmentRoutes(app: FastifyInstance) {

  function ensureEnabled(reply: any): boolean {
    if (process.env.QR_ENROLLMENT_ENABLED !== 'true') {
      reply.status(501).send({
        statusCode: 501,
        error:      'Not Implemented',
        message:    'QR-scan enrollment is not yet enabled. Set QR_ENROLLMENT_ENABLED=true once attorney review of the wallet-linkage consent text (services/enrollmentConsent.ts) is complete.',
      });
      return false;
    }
    return true;
  }

  // ── GET /enrollment/consent-text ────────────────────────────────────────
  // Returns the current consent text + hash + version. Front-ends render
  // this verbatim to the customer BEFORE showing the QR.
  app.get('/enrollment/consent-text', async (_request, reply) => {
    return reply.send({
      version:  CONSENT_VERSION,
      hash:     CONSENT_TEXT_HASH,
      text:     CONSENT_TEXT,
    });
  });

  // ── POST /enrollment/qr/session ─────────────────────────────────────────
  // Merchant-triggered: creates a session, calls Xumm to build a SignIn
  // payload, returns the QR URL + poll URL for the merchant's kiosk to
  // display and poll respectively.
  app.post<{ Body: { merchantId: string; chain?: 'xrpl' } }>(
    '/enrollment/qr/session',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (!ensureEnabled(reply)) return;

      const { merchantId, chain = 'xrpl' } = request.body ?? {};
      if (!merchantId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'merchantId is required' });
      }
      if (chain !== 'xrpl') {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'Only chain=xrpl is supported in this MVP' });
      }

      const merchant = await app.prisma.merchant.findUnique({ where: { id: merchantId } });
      if (!merchant) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found',
          message: 'Merchant not found' });
      }

      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      const session = await app.prisma.enrollmentSession.create({
        data: {
          chain,
          merchantIdContext: merchantId,
          expiresAt,
          consentTextHash:   CONSENT_TEXT_HASH,
          consentTextVersion: CONSENT_VERSION,
        },
      });

      const payload = await createSignInPayload({
        sessionId:  session.id,
        merchantId,
      });

      return reply.status(201).send({
        sessionId:        session.id,
        expiresAt:        expiresAt.toISOString(),
        xummUuid:         payload.uuid,
        qrPng:            payload.refs.qr_png,
        signUrl:          payload.next.always,
        websocketStatus:  payload.refs.websocket_status,
        consentVersion:   CONSENT_VERSION,
        consentHash:      CONSENT_TEXT_HASH,
        xummConfigured:   isXummConfigured(),
      });
    },
  );

  // ── GET /enrollment/qr/session/:id ──────────────────────────────────────
  // Poll status. Also refreshes state from Xumm if the session is still pending
  // and Xumm creds are configured.
  app.get<{ Params: { id: string } }>(
    '/enrollment/qr/session/:id',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (!ensureEnabled(reply)) return;

      const session = await app.prisma.enrollmentSession.findUnique({ where: { id: request.params.id } });
      if (!session) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });

      // Expire lazily on read
      if (session.status === 'pending' && session.expiresAt < new Date()) {
        await app.prisma.enrollmentSession.update({
          where: { id: session.id },
          data:  { status: 'expired' },
        });
        return reply.send({ ...session, status: 'expired' });
      }

      // Optional: refresh from Xumm if pending and creds available
      if (session.status === 'pending' && isXummConfigured()) {
        // We don't store the Xumm UUID separately — the stub uses a
        // deterministic uuid derived from session.id. When real Xumm creds
        // are set, a follow-up refactor will store payload.uuid on the
        // session row and use it here. For now, pass through.
      }

      return reply.send(session);
    },
  );

  // ── POST /enrollment/qr/session/:id/complete ────────────────────────────
  // Called after wallet-side sign-in resolves. Body carries the XRPL
  // address the wallet returned. In stub mode this is called directly by
  // the merchant or a test; in production it's triggered by a webhook /
  // websocket callback from Xumm and validated against Xumm's own record.
  app.post<{ Params: { id: string }; Body: { xrplAddress: string; customerContact?: { phone?: string; email?: string } } }>(
    '/enrollment/qr/session/:id/complete',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (!ensureEnabled(reply)) return;

      const { xrplAddress, customerContact } = request.body ?? {};
      if (!xrplAddress) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'xrplAddress is required' });
      }

      const session = await app.prisma.enrollmentSession.findUnique({ where: { id: request.params.id } });
      if (!session) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });

      if (session.status !== 'pending') {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict',
          message: `Session is ${session.status}, expected pending`, status: session.status });
      }
      if (session.expiresAt < new Date()) {
        await app.prisma.enrollmentSession.update({
          where: { id: session.id },
          data:  { status: 'expired' },
        });
        return reply.status(410).send({ statusCode: 410, error: 'Gone', message: 'Session expired' });
      }

      // Look up existing customer by xrplAddress OR contact; create if missing.
      let customer = await app.prisma.acquisCustomer.findUnique({ where: { xrplAddress } });
      if (!customer && customerContact?.phone) {
        customer = await app.prisma.acquisCustomer.findUnique({ where: { phone: customerContact.phone } });
      }
      if (!customer && customerContact?.email) {
        customer = await app.prisma.acquisCustomer.findUnique({ where: { email: customerContact.email } });
      }
      if (!customer) {
        customer = await app.prisma.acquisCustomer.create({
          data: {
            xrplAddress,
            phone:                 customerContact?.phone ?? null,
            email:                 customerContact?.email ?? null,
            enrollingMerchantId:   session.merchantIdContext,
            rewardsConsentGranted: true,
            rewardsConsentAt:      new Date(),
            kycLevel:              'rewards_only',
          },
        });
      } else if (!customer.xrplAddress) {
        // Existing customer, first time linking wallet — persist the address.
        customer = await app.prisma.acquisCustomer.update({
          where: { acquisId: customer.acquisId },
          data:  { xrplAddress, enrollingMerchantId: customer.enrollingMerchantId ?? session.merchantIdContext },
        });
      }

      // Mint an AcquisMember credential to the enrolled XRPL address.
      // Non-fatal on failure — credential can be re-issued later without
      // invalidating the enrollment record. Surface the specific reason in
      // the response so callers can distinguish reserve/unfunded errors
      // ('tecINSUFFICIENT_RESERVE' / 'tecNO_TARGET' / etc.) from other
      // failures. Empirically confirmed on testnet 2026-07-13 that the
      // Credential ledger entry counts against the ISSUER's owner reserve,
      // not the subject's (see /tmp/reserve-impact-proof.mjs output).
      let credentialTxHash: string | null = null;
      let credentialError:  string | null = null;
      try {
        const c = await createCredential({
          subjectAddress:   xrplAddress,
          hederaNftTokenId: process.env.ACQUIS_NFT_TOKEN_ID ?? '0.0.0',
          hederaNftSerial:  0,
        });
        credentialTxHash = c.txHash;
      } catch (err) {
        credentialError = err instanceof Error ? err.message : String(err);
        app.log.error({ err, subjectAddress: xrplAddress },
          'CredentialCreate failed during QR enrollment — record kept, credential can be re-issued');
      }

      // Write consent-hash to HCS for immutable audit.
      let hcsSeq: number | null = null;
      try {
        const hcsResult = await HCSService.submitMessage({
          topic_id: HCS_TOPIC,
          message: JSON.stringify({
            type:              'qr_enrollment.consent',
            sessionId:         session.id,
            acquisId:          customer.acquisId,
            xrplAddress,
            merchantId:        session.merchantIdContext,
            consentVersion:    CONSENT_VERSION,
            consentTextHash:   CONSENT_TEXT_HASH,
            credentialTxHash,
            timestamp:         new Date().toISOString(),
          }),
        });
        hcsSeq = hcsResult.sequence_number;
      } catch (err) {
        app.log.error({ err }, 'HCS consent write failed during QR enrollment');
      }

      const now = new Date();
      const updated = await app.prisma.enrollmentSession.update({
        where: { id: session.id },
        data:  {
          status:              'completed',
          capturedWalletAddress: xrplAddress,
          scannedAt:           session.scannedAt ?? now,
          completedAt:         now,
          acquisId:            customer.acquisId,
          credentialTxHash,
          hcsConsentTopicId:   HCS_TOPIC,
          hcsConsentSeqNumber: hcsSeq,
        },
      });

      return reply.status(200).send({
        sessionId:        updated.id,
        status:           updated.status,
        acquisId:         customer.acquisId,
        xrplAddress,
        credentialTxHash,
        credentialError,
        hcsConsentTopicId: HCS_TOPIC,
        hcsConsentSeqNumber: hcsSeq,
        consentVersion:    CONSENT_VERSION,
        consentHash:       CONSENT_TEXT_HASH,
      });
    },
  );

  // ── POST /enrollment/qr/session/:id/cancel ──────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/enrollment/qr/session/:id/cancel',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (!ensureEnabled(reply)) return;

      const session = await app.prisma.enrollmentSession.findUnique({ where: { id: request.params.id } });
      if (!session) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
      if (session.status !== 'pending') {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: `Session is ${session.status}` });
      }
      const updated = await app.prisma.enrollmentSession.update({
        where: { id: session.id },
        data:  { status: 'cancelled', cancelledAt: new Date() },
      });
      return reply.send(updated);
    },
  );
}
