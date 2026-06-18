import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  TransferService: {
    transferToken: jest.fn().mockResolvedValue(undefined),
    transferHbar: jest.fn().mockResolvedValue(undefined),
  },
  getClient: jest.fn(),
}));

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

const ENV = {
  HEDERA_OPERATOR_ID: '0.0.11111',
  HEDERA_OPERATOR_KEY: 'mock-key',
  HEDERA_DEFAULT_TOKEN_ID: '0.0.99999',
};

describe('Pay route', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => { Object.assign(process.env, ENV); });

  it('POST /api/v1/pay returns 400 when toAccountId is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { amount: 10 }, headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/pay token mode uses HEDERA_DEFAULT_TOKEN_ID', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 50 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.tokenId).toBe('0.0.99999');
    expect(body.mode).toBe('token');
  });

  it('POST /api/v1/pay token mode accepts explicit tokenId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 50, tokenId: '0.0.88888' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokenId).toBe('0.0.88888');
  });

  it('POST /api/v1/pay hbar mode does not return tokenId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 5, mode: 'hbar' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe('hbar');
    expect(body.tokenId).toBeUndefined();
  });

  it('POST /api/v1/pay returns 400 when no tokenId and none configured', async () => {
    const saved = process.env.HEDERA_DEFAULT_TOKEN_ID;
    delete process.env.HEDERA_DEFAULT_TOKEN_ID;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 50 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    process.env.HEDERA_DEFAULT_TOKEN_ID = saved;
  });
});
