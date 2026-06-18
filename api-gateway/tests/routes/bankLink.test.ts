import { getApp, authHeader } from '../helpers';

// Valid 32-byte key for AES-256-GCM in tests
process.env.ENCRYPTION_KEY = '0'.repeat(64);

jest.mock('../../src/services/plaid', () => ({
  createLinkToken: jest.fn().mockResolvedValue('link-sandbox-abc123'),
  exchangePublicToken: jest.fn().mockResolvedValue({ accessToken: 'access-sandbox-xyz', itemId: 'item-1' }),
  getAccountInfo: jest.fn().mockResolvedValue({
    institutionName: 'Chase',
    accounts: [{ accountId: 'acct-1', mask: '0000', name: 'Checking', type: 'depository' }],
  }),
  createStripeProcessorToken: jest.fn().mockResolvedValue('btok_stripe_abc'),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/stripe', () => ({
  createCustomerWithBankAccount: jest.fn().mockResolvedValue({ stripeCustomerId: 'cus_abc', stripeSourceId: 'ba_abc' }),
  initiateACHCharge: jest.fn(),
  constructWebhookEvent: jest.fn(),
}));

const mockRecord = {
  id: 'ba-record-1',
  hederaAccountId: '0.0.12345',
  institutionName: 'Chase',
  accountMask: '0000',
  accountType: 'depository',
  plaidAccountId: 'acct-1',
  encryptedToken: 'fake-cipher',
  tokenIv: 'fake-iv',
  tokenTag: 'fake-tag',
  stripeCustomerId: 'cus_abc',
  stripeSourceId: 'ba_abc',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Use jest.requireActual to wrap mock with fp() so app decorations reach the parent scope
jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        bankAccount: {
          create: jest.fn().mockResolvedValue(mockRecord),
          findMany: jest.fn().mockResolvedValue([mockRecord]),
          findFirst: jest.fn().mockResolvedValue(mockRecord),
          update: jest.fn().mockResolvedValue({ ...mockRecord, status: 'unlinked' }),
        },
        fundingRequest: {
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          findUnique: jest.fn(),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

describe('Bank link routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  it('POST /api/v1/bank-link/token returns a link token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/bank-link/token',
      payload: { hederaAccountId: '0.0.12345' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().linkToken).toBe('link-sandbox-abc123');
  });

  it('POST /api/v1/bank-link/token returns 400 when hederaAccountId missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/bank-link/token',
      payload: {},
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/bank-link/token requires x-api-key', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/bank-link/token',
      payload: { hederaAccountId: '0.0.12345' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/bank-link/exchange creates a bank account record', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/bank-link/exchange',
      payload: { hederaAccountId: '0.0.12345', publicToken: 'public-tok', accountId: 'acct-1' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.bankAccountId).toBe('ba-record-1');
    expect(body.institutionName).toBe('Chase');
    expect(body.accountMask).toBe('0000');
  });

  it('POST /api/v1/bank-link/exchange returns 400 when fields missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/bank-link/exchange',
      payload: { hederaAccountId: '0.0.12345' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/bank-link returns linked accounts list', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/bank-link?hederaAccountId=0.0.12345',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.accounts)).toBe(true);
    expect(body.accounts[0].institutionName).toBe('Chase');
    expect(body.accounts[0].accountMask).toBe('0000');
  });

  it('GET /api/v1/bank-link returns 400 when hederaAccountId missing', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/bank-link',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/bank-link/:id unlinks an account', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/bank-link/ba-record-1?hederaAccountId=0.0.12345',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/bank-link/:id requires x-api-key', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/bank-link/ba-record-1?hederaAccountId=0.0.12345',
    });
    expect(res.statusCode).toBe(401);
  });
});
