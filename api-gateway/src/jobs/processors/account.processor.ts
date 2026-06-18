import type { Job } from 'bull';
import { AccountService } from '@acquis/hedera-service';

export async function accountCreateProcessor(job: Job) {
  const { initialHbar } = job.data.payload as { initialHbar?: number };
  return AccountService.createAccount(initialHbar);
}
