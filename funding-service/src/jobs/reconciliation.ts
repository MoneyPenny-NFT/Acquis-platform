import Queue from 'bull';
import type { FundingService } from '../services/FundingService';

export type ReconciliationJobName =
  | 'expire-rfps'
  | 'sweep-unmatched'
  | 'retry-hcs';

export function createReconciliationQueue(
  redisUrl: string,
  service: FundingService,
): Queue.Queue<ReconciliationJobName> {
  const queue = new Queue<ReconciliationJobName>('reconciliation', redisUrl);

  queue.process('expire-rfps', async (job) => {
    const count = await service.expireStaleRfPs();
    job.log(`Expired ${count} stale RfPs`);
    return { expired: count };
  });

  queue.process('sweep-unmatched', async (job) => {
    const count = await service.sweepUnmatchedCredits();
    job.log(`Swept ${count} unmatched credits to review queue`);
    return { swept: count };
  });

  queue.process('retry-hcs', async (job) => {
    const count = await service.retryFailedHcsWrites();
    job.log(`Retried ${count} failed HCS writes`);
    return { retried: count };
  });

  queue.on('failed', (job, err) => {
    console.error(`[reconciliation] job ${job.name} failed:`, err.message);
  });

  return queue;
}

/** Schedule recurring jobs using cron expressions from env. */
export async function scheduleRecurringJobs(
  queue: Queue.Queue<ReconciliationJobName>,
): Promise<void> {
  const expireCron   = process.env.EXPIRE_CRON   ?? '*/5 * * * *';
  const sweepCron    = process.env.SWEEP_CRON    ?? '*/10 * * * *';
  const hcsRetryCron = process.env.HCS_RETRY_CRON ?? '*/2 * * * *';

  // Remove existing repeatable jobs before re-scheduling (prevents duplicates on restart)
  await queue.removeRepeatable('expire-rfps',   { cron: expireCron });
  await queue.removeRepeatable('sweep-unmatched', { cron: sweepCron });
  await queue.removeRepeatable('retry-hcs',     { cron: hcsRetryCron });

  await queue.add('expire-rfps',    {} as unknown as ReconciliationJobName, { repeat: { cron: expireCron } });
  await queue.add('sweep-unmatched', {} as unknown as ReconciliationJobName, { repeat: { cron: sweepCron } });
  await queue.add('retry-hcs',      {} as unknown as ReconciliationJobName, { repeat: { cron: hcsRetryCron } });

  console.log('[reconciliation] Recurring jobs scheduled');
}
