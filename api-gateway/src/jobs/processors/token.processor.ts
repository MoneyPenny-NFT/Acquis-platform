import type { Job } from 'bull';
import { TokenService } from '@acquis/hedera-service';
import type { TokenCreateParams } from '@acquis/hedera-service';

export async function tokenCreateProcessor(job: Job) {
  const params = job.data.payload as TokenCreateParams;
  return TokenService.createToken(params);
}

export async function tokenMintProcessor(job: Job) {
  const { tokenId, supplyKey, amount } = job.data.payload as {
    tokenId: string;
    supplyKey: string;
    amount: number;
  };
  return TokenService.mintTokens(tokenId, supplyKey, amount);
}

export async function tokenBurnProcessor(job: Job) {
  const { tokenId, supplyKey, amount } = job.data.payload as {
    tokenId: string;
    supplyKey: string;
    amount: number;
  };
  return TokenService.burnTokens(tokenId, supplyKey, amount);
}

export async function tokenAssociateProcessor(job: Job) {
  const { accountId, accountKey, tokenIds } = job.data.payload as {
    accountId: string;
    accountKey: string;
    tokenIds: string[];
  };
  return TokenService.associateToken(accountId, accountKey, tokenIds);
}
