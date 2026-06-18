import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type Queue from 'bull';
import type { ReconciliationJobName } from '../jobs/reconciliation';

declare module 'fastify' {
  interface FastifyInstance {
    reconciliationQueue: Queue.Queue<ReconciliationJobName> | null;
  }
}

async function queuePlugin(app: FastifyInstance) {
  const redisUrl = process.env.REDIS_URL;
  let queue: Queue.Queue<ReconciliationJobName> | null = null;

  if (redisUrl) {
    // Lazy import so the service starts without Redis in test environments
    const { createReconciliationQueue, scheduleRecurringJobs } = await import('../jobs/reconciliation');
    const service = (app as unknown as { fundingService: import('../services/FundingService').FundingService }).fundingService;
    queue = createReconciliationQueue(redisUrl, service);
    await scheduleRecurringJobs(queue);
    app.log.info('Reconciliation queue started');
  } else {
    app.log.warn('REDIS_URL not set — reconciliation jobs disabled');
  }

  app.decorate('reconciliationQueue', queue);
  app.addHook('onClose', async () => {
    if (queue) await queue.close();
  });
}

export default fp(queuePlugin, { name: 'queue' });
