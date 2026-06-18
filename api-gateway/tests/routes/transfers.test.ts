import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  TransferService: {
    transferHbar: jest.fn().mockResolvedValue(undefined),
    transferToken: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

describe('Transfer routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  it('POST /api/v1/transfers/hbar returns transfer summary', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/transfers/hbar', payload: { fromId: '0.0.11111', fromKey: 'mock-key', toId: '0.0.22222', amount: 5 }, headers: authHeader });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ asset: 'HBAR', amount: 5 });
  });

  it('POST /api/v1/transfers/token returns transfer summary', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/transfers/token', payload: { tokenId: '0.0.99999', fromId: '0.0.11111', fromKey: 'mock-key', toId: '0.0.22222', amount: 100 }, headers: authHeader });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tokenId: '0.0.99999', amount: 100 });
  });
});
