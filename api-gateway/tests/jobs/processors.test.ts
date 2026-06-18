import { accountCreateProcessor } from '../../src/jobs/processors/account.processor';
import {
  tokenCreateProcessor,
  tokenMintProcessor,
  tokenBurnProcessor,
  tokenAssociateProcessor,
} from '../../src/jobs/processors/token.processor';
import {
  transferHbarProcessor,
  transferTokenProcessor,
} from '../../src/jobs/processors/transfer.processor';

jest.mock('@acquis/hedera-service', () => ({
  AccountService: {
    createAccount: jest.fn().mockResolvedValue({ accountId: '0.0.12345', privateKey: 'k', publicKey: 'p' }),
  },
  TokenService: {
    createToken: jest.fn().mockResolvedValue({ tokenId: '0.0.99999' }),
    mintTokens: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    burnTokens: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    associateToken: jest.fn().mockResolvedValue(undefined),
  },
  TransferService: {
    transferHbar: jest.fn().mockResolvedValue(undefined),
    transferToken: jest.fn().mockResolvedValue(undefined),
  },
}));

function makeJob(payload: Record<string, unknown>) {
  return { data: { payload } } as any;
}

describe('Job processors', () => {
  it('accountCreateProcessor calls createAccount', async () => {
    const result = await accountCreateProcessor(makeJob({ initialHbar: 10 }));
    expect(result.accountId).toBe('0.0.12345');
  });

  it('tokenCreateProcessor calls createToken', async () => {
    const result = await tokenCreateProcessor(makeJob({
      name: 'T', symbol: 'T', decimals: 2, initialSupply: 100,
      treasuryAccountId: '0.0.1', treasuryKey: 'k',
    }));
    expect(result.tokenId).toBe('0.0.99999');
  });

  it('tokenMintProcessor calls mintTokens', async () => {
    await expect(
      tokenMintProcessor(makeJob({ tokenId: '0.0.99999', supplyKey: 'k', amount: 100 })),
    ).resolves.not.toThrow();
  });

  it('tokenBurnProcessor calls burnTokens', async () => {
    await expect(
      tokenBurnProcessor(makeJob({ tokenId: '0.0.99999', supplyKey: 'k', amount: 10 })),
    ).resolves.not.toThrow();
  });

  it('tokenAssociateProcessor calls associateToken', async () => {
    await expect(
      tokenAssociateProcessor(makeJob({ accountId: '0.0.1', accountKey: 'k', tokenIds: ['0.0.99999'] })),
    ).resolves.not.toThrow();
  });

  it('transferHbarProcessor calls transferHbar', async () => {
    await expect(
      transferHbarProcessor(makeJob({ fromId: '0.0.1', fromKey: 'k', toId: '0.0.2', amount: 5 })),
    ).resolves.not.toThrow();
  });

  it('transferTokenProcessor calls transferToken', async () => {
    await expect(
      transferTokenProcessor(makeJob({ tokenId: '0.0.99999', fromId: '0.0.1', fromKey: 'k', toId: '0.0.2', amount: 100 })),
    ).resolves.not.toThrow();
  });
});
