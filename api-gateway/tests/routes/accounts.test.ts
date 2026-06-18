import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  AccountService: {
    createAccount: jest.fn().mockResolvedValue({ accountId: '0.0.12345', privateKey: 'mock-private-key', publicKey: 'mock-public-key' }),
    getAccountInfo: jest.fn().mockResolvedValue({ accountId: '0.0.12345' }),
  },
}));

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

describe('Account routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  it('POST /api/v1/accounts returns 201 with account fields', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/accounts',
      payload: { initialHbar: 10 }, headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.accountId).toBe('0.0.12345');
    expect(body).toHaveProperty('privateKey');
    expect(body).toHaveProperty('publicKey');
  });

  it('GET /api/v1/accounts/:accountId returns account info', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/accounts/0.0.12345',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accountId).toBe('0.0.12345');
  });
});
