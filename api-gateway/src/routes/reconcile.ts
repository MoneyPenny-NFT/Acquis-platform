import type { FastifyInstance } from 'fastify';
import { creditWebhookReward } from './webhooks';

const MAX_LOOKBACK_DAYS = 90;
const DEFAULT_LOOKBACK_DAYS = 30;

interface ReconcileParams { acquisId: string }
interface ReconcileBody  { lookbackDays?: number }

interface ContactJson { phone?: string; email?: string }

export async function reconcileRoutes(app: FastifyInstance) {

  // ── POST /customers/:acquisId/reconcile ──────────────────────────────────
  // Scans customer_not_found webhook events in the lookback window for any
  // that match this customer's phone or email, then retroactively credits them.
  //
  // Idempotency: events with status !== 'customer_not_found' are skipped,
  // so clicking the reconcile button twice is safe.
  //
  // Unrecoverable events: Square anonymous swipes (customerContact = null)
  // cannot be matched and are reported in the `unrecoverable` count.
  app.post<{ Params: ReconcileParams; Body: ReconcileBody }>(
    '/customers/:acquisId/reconcile',
    async (request, reply) => {
      const { acquisId } = request.params;
      const lookbackDays = Math.min(
        request.body?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
        MAX_LOOKBACK_DAYS,
      );

      if (!app.dbReady) {
        return reply.status(503).send({ error: 'Database unavailable' });
      }

      const customer = await app.prisma.acquisCustomer.findUnique({ where: { acquisId } });
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' });
      }

      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

      // Fetch all customer_not_found events in the lookback window.
      // Filter in JS — SQLite has no indexed JSON path support, and
      // volume in this window is expected to be small.
      const candidates = await app.prisma.webhookEvent.findMany({
        where: {
          status:    'customer_not_found',
          createdAt: { gte: since },
          customerContact: { not: null },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Match by phone or email against this customer's contact info.
      const matches = candidates.filter(ev => {
        let contact: ContactJson = {};
        try { contact = JSON.parse(ev.customerContact ?? '{}'); } catch { return false; }
        if (customer.phone && contact.phone && contact.phone === customer.phone) return true;
        if (customer.email && contact.email && contact.email === customer.email) return true;
        return false;
      });

      const results: Array<{
        webhookEventId: string;
        status: 'credited' | 'skipped_zero' | 'error';
        amountCents: number | null;
        rewardUnits?: number;
        error?: string;
      }> = [];

      let totalRewardUnits = 0;

      for (const ev of matches) {
        if (!ev.amountCents || ev.amountCents <= 0) {
          results.push({ webhookEventId: ev.id, status: 'skipped_zero', amountCents: ev.amountCents });
          continue;
        }

        try {
          const rewardEventId = await creditWebhookReward(app, {
            merchantId:  ev.merchantId,
            customerId:  customer.acquisId,
            amountCents: ev.amountCents,
            externalRef: ev.externalRef ?? `reconcile_${ev.id}`,
            source:      'reconcile',
          });

          await app.prisma.webhookEvent.update({
            where: { id: ev.id },
            data:  { customerId: customer.acquisId, rewardEventId, status: 'retroactive_credited' },
          });

          // Calculate what was credited to include in response
          const rateBps = 100; // approximation for display — actual used inside creditWebhookReward
          const rewardUnits = rewardEventId
            ? (await app.prisma.rewardEvent.findUnique({ where: { id: rewardEventId! } }))?.rewardUnits ?? 0
            : 0;

          totalRewardUnits += rewardUnits;
          results.push({ webhookEventId: ev.id, status: 'credited', amountCents: ev.amountCents, rewardUnits });
        } catch (err: any) {
          app.log.error({ err, webhookEventId: ev.id }, 'Reconcile credit failed');
          results.push({ webhookEventId: ev.id, status: 'error', amountCents: ev.amountCents, error: err?.message });
        }
      }

      // Count unrecoverable events (customer_not_found with null customerContact)
      // for informational purposes — these are Square anonymous swipes.
      const unrecoverable = await app.prisma.webhookEvent.count({
        where: {
          status:          'customer_not_found',
          createdAt:       { gte: since },
          customerContact: null,
        },
      });

      const credited = results.filter(r => r.status === 'credited').length;

      return reply.send({
        acquisId,
        lookbackDays,
        examined:         matches.length,
        credited,
        skipped:          results.filter(r => r.status === 'skipped_zero').length,
        errors:           results.filter(r => r.status === 'error').length,
        totalRewardUnits,
        totalRewardDisplay: (totalRewardUnits / 100).toFixed(2) + ' AQT',
        unrecoverableCount: unrecoverable,
        events:           results,
      });
    },
  );
}
