import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  TokenService: {
    createToken: jest.fn().mockResolvedValue({ tokenId: '0.0.99999', name: 'Test Token', symbol: 'TST', decimals: 2, initialSupply: 1000 }),
    mintTokens: jest.fn().mockResolvedValue({ status: { toString: () => 'SUCCESS' } }),
    burnTokens: jest.fn().mockResolvedValue({ status: { toString: () => 'SUCCESS' } }),
    associateToken: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

const tokenBody = { name: 'Test Token', symbol: 'TST', decimals: 2, initialSupply: 1000, treasuryAccountId: '0.0.11111', treasuryKey: 'mock-treasury-key' };

describe('Token routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  it('POST /api/v1/tokens returns 201 with tokenId', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tokens', payload: tokenBody, headers: authHeader });
    expect(res.statusCode).toBe(201);
    expect(res.json().tokenId).toBe('0.0.99999');
  });

  it('POST /api/v1/tokens/:tokenId/mint returns minted amount and status', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tokens/0.0.99999/mint', payload: { supplyKey: 'mock-key', amount: 500 }, headers: authHeader });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ minted: 500, status: 'SUCCESS' });
  });

  it('POST /api/v1/tokens/:tokenId/burn returns burned amount and status', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tokens/0.0.99999/burn', payload: { supplyKey: 'mock-key', amount: 100 }, headers: authHeader });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ burned: 100, status: 'SUCCESS' });
  });

  it('POST /api/v1/tokens/:tokenId/associate returns 204', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tokens/0.0.99999/associate', payload: { accountId: '0.0.22222', accountKey: 'mock-key' }, headers: authHeader });
    expect(res.statusCode).toBe(204);
  });
});
