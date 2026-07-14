import type { FastifyInstance } from 'fastify';
import * as StripeService from '../services/stripe';

interface MerchantIdParam { merchantId: string }
interface LinkBody {
  refreshUrl: string;
  returnUrl:  string;
}
interface CreateBody { email?: string }

// Stripe Connect endpoints. Delegates KYB, BOI, entity verification, and
// card-network onboarding to Stripe for each merchant. When the merchant
// completes Stripe's hosted onboarding, charges_enabled + payouts_enabled
// become true on the Connected Account and mirror onto the Merchant record.
//
// Uses account type: 'express' — Stripe-hosted KYB flow and Express
// dashboard. Chosen for pilot; revisit at go-live (Controller config is
// Stripe's modern recommended pattern for new platforms and is NOT
// backward-migratable from Express).
//
// Gated by STRIPE_CONNECT_ENABLED=true — off by default.
export async function stripeConnectRoutes(app: FastifyInstance) {
  function ensureEnabled(reply: any): boolean {
    if (process.env.STRIPE_CONNECT_ENABLED !== 'true') {
      reply.status(501).send({
        statusCode: 501,
        error:      'Not Implemented',
        message:    'Stripe Connect Custom is not yet enabled. Set STRIPE_CONNECT_ENABLED=true and provision STRIPE_SECRET_KEY (test-mode) in env.',
      });
      return false;
    }
    return true;
  }

  // ── POST /merchants/:merchantId/stripe-connect/create ──────────────────
  app.post<{ Params: MerchantIdParam; Body: CreateBody }>(
    '/merchants/:merchantId/stripe-connect/create',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (!ensureEnabled(reply)) return;

      const merchant = await app.prisma.merchant.findUnique({ where: { id: request.params.merchantId } });
      if (!merchant) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Merchant not found' });

      if (merchant.stripeAccountId) {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict',
          message: 'Merchant already has a Stripe Connect account',
          stripeAccountId: merchant.stripeAccountId });
      }

      const acct = await StripeService.createConnectAccount(
        merchant.id, merchant.legalName, request.body?.email,
      );

      const updated = await app.prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          stripeAccountId:        acct.accountId,
          stripeChargesEnabled:   acct.chargesEnabled,
          stripePayoutsEnabled:   acct.payoutsEnabled,
          stripeRequirementsJson: JSON.stringify(acct.requirements ?? {}),
          status:                 merchant.status === 'agreement_signed' ? 'stripe_pending' : merchant.status,
        },
      });

      return reply.status(201).send({
        merchantId:     updated.id,
        stripeAccountId: acct.accountId,
        chargesEnabled:  acct.chargesEnabled,
        payoutsEnabled:  acct.payoutsEnabled,
        status:          updated.status,
      });
    },
  );

  // ── POST /merchants/:merchantId/stripe-connect/link ─────────────────────
  // Returns a Stripe-hosted onboarding URL the merchant clicks through to
  // complete their KYB with Stripe.
  app.post<{ Params: MerchantIdParam; Body: LinkBody }>(
    '/merchants/:merchantId/stripe-connect/link',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (!ensureEnabled(reply)) return;

      const { refreshUrl, returnUrl } = request.body ?? {};
      if (!refreshUrl || !returnUrl) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'refreshUrl and returnUrl are required' });
      }

      const merchant = await app.prisma.merchant.findUnique({ where: { id: request.params.merchantId } });
      if (!merchant?.stripeAccountId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
          message: 'Merchant has no Stripe Connect account. Call /stripe-connect/create first.' });
      }

      const link = await StripeService.createConnectAccountLink(
        merchant.stripeAccountId, refreshUrl, returnUrl,
      );
      return reply.send({ url: link.url, expiresAt: link.expiresAt });
    },
  );

  // ── GET /merchants/:merchantId/stripe-connect/status ────────────────────
  // Reads the current KYB state from Stripe and syncs the mirror columns.
  app.get<{ Params: MerchantIdParam }>(
    '/merchants/:merchantId/stripe-connect/status',
    async (request, reply) => {
      if (!app.dbReady) return reply.status(503).send({ error: 'Database unavailable' });
      if (!ensureEnabled(reply)) return;

      const merchant = await app.prisma.merchant.findUnique({ where: { id: request.params.merchantId } });
      if (!merchant?.stripeAccountId) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found',
          message: 'Merchant has no Stripe Connect account' });
      }

      const acct = await StripeService.retrieveConnectAccount(merchant.stripeAccountId);

      const updated = await app.prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          stripeChargesEnabled:   acct.chargesEnabled,
          stripePayoutsEnabled:   acct.payoutsEnabled,
          stripeRequirementsJson: JSON.stringify(acct.requirements ?? {}),
          status: acct.chargesEnabled && acct.payoutsEnabled && merchant.status !== 'suspended'
            ? 'active'
            : merchant.status,
        },
      });

      return reply.send({
        merchantId:     updated.id,
        stripeAccountId: acct.accountId,
        chargesEnabled:  acct.chargesEnabled,
        payoutsEnabled:  acct.payoutsEnabled,
        detailsSubmitted: acct.detailsSubmitted,
        requirements:    acct.requirements,
        status:          updated.status,
      });
    },
  );
}
