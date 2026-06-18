import { getApp, authHeader } from '../helpers';

jest.mock('../../src/services/stripe', () => ({
  createCustomerWithBankAccount: jest.fn(),
  initiateACHCharge: jest.fn().mockResolvedValue({ chargeId: 'ch_test_123', status: 'pending' }),
  constructWebhookEvent: jest.fn().mockReturnValue({
    type: 'charge.succeeded',
    data: {
      object: {
        id: 'ch_test_123',
        metadata: { fundingRequestId: 'fr-1', hederaAccountId: '0.0.12345' },
      },
    },
  }),
}));

jest.mock('@acquis/hedera-service', () => ({
  TransferService: {
    transferToken: jest.fn().mockResolvedValue(undefined),
    transferHbar: jest.fn().mockResolvedValue(undefined),
  },
  getClient: jest.fn(),
}));

const mockBankAccount = {
  id: 'ba-1',
  hederaAccountId: '0.0.12345',
  stripeCustomerId: 'cus_abc',
  stripeSourceId: 'ba_abc',
  status: 'active',
};

const mockFundingRequest = {
  id: 'fr-1',
  hederaAccountId: '0.0.12345',
  amountCents: 5000,
  status: 'processing',
};

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        bankAccount: {
          create: jest.fn(),
          findMany: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(mockBankAccount),
          update: jest.fn(),
        },
        fundingRequest: {
          create: jest.fn().mockResolvedValue(mockFundingRequest),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue(mockFundingRequest),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

describe('Fund routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    process.env.HEDERA_OPERATOR_ID = '0.0.11111';
    process.env.HEDERA_OPERATOR_KEY = 'mock-key';
    process.env.HEDERA_DEFAULT_TOKEN_ID = '0.0.99999';
  });

  it('POST /api/v1/fund returns 202 with fundingRequestId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/fund',
      payload: { bankAccountId: 'ba-1', hederaAccountId: '0.0.12345', amountCents: 5000 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.fundingRequestId).toBe('fr-1');
    expect(body.status).toBe('processing');
    expect(body.amountCents).toBe(5000);
  });

  it('POST /api/v1/fund returns 400 when required fields missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/fund',
      payload: { bankAccountId: 'ba-1' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/fund returns 400 when amountCents is zero', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/fund',
      payload: { bankAccountId: 'ba-1', hederaAccountId: '0.0.12345', amountCents: 0 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/fund requires x-api-key', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/fund',
      payload: { bankAccountId: 'ba-1', hederaAccountId: '0.0.12345', amountCents: 5000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/fund/webhook does NOT require x-api-key', async () => {
    // Webhook is exempt from API key auth — should reach the handler and return 400 (missing sig) not 401
    const res = await app.inject({
      method: 'POST', url: '/api/v1/fund/webhook',
      payload: {},
    });
    expect(res.statusCode).not.toBe(401);
  });

  it('POST /api/v1/fund/webhook returns 400 when stripe-signature missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/fund/webhook',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/stripe-signature/);
  });

  it('POST /api/v1/fund/webhook processes charge.succeeded and returns 200', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/fund/webhook',
      payload: '{}',
      headers: { 'stripe-signature': 'sig-test', 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });
});
