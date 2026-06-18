import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  AccountService: { createAccount: jest.fn().mockResolvedValue({ accountId: '0.0.1', privateKey: 'k', publicKey: 'p' }) },
  TokenService: {},
  TransferService: {},
  getClient: jest.fn(),
}));

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

describe('Auth middleware', () => {
  const app = getApp();
  afterAll(() => app.close());

  it('GET /api/v1/health is exempt — no key required', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).not.toBe(401);
  });

  it('returns 401 when x-api-key header is missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/accounts', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Unauthorized');
  });

  it('returns 401 when x-api-key is wrong', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/accounts', payload: {},
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 201 when x-api-key is correct', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/accounts', payload: {},
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
  });
});
