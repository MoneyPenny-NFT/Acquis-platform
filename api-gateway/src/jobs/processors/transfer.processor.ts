import type { Job } from 'bull';
import { TransferService } from '@acquis/hedera-service';

export async function transferHbarProcessor(job: Job) {
  const { fromId, fromKey, toId, amount } = job.data.payload as {
    fromId: string;
    fromKey: string;
    toId: string;
    amount: number;
  };
  return TransferService.transferHbar(fromId, fromKey, toId, amount);
}

export async function transferTokenProcessor(job: Job) {
  const { tokenId, fromId, fromKey, toId, amount } = job.data.payload as {
    tokenId: string;
    fromId: string;
    fromKey: string;
    toId: string;
    amount: number;
  };
  return TransferService.transferToken(tokenId, fromId, fromKey, toId, amount);
}
