import Bull from 'bull';

export type HederaJobType =
  | 'account_create'
  | 'token_create'
  | 'token_mint'
  | 'token_burn'
  | 'transfer_hbar'
  | 'transfer_token';

export interface HederaJobData {
  type: HederaJobType;
  payload: Record<string, unknown>;
  transactionId?: string;
}

export function createHederaQueue(): Bull.Queue<HederaJobData> {
  return new Bull<HederaJobData>('hedera', {
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
}
