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
        merchantConfig: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

function getTransferToken() {
  return (jest.requireMock('@acquis/hedera-service') as { TransferService: { transferToken: jest.Mock } })
    .TransferService.transferToken;
}

const webhookHeaders = { 'stripe-signature': 'sig-test', 'content-type': 'application/json' };

describe('Fund routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HEDERA_OPERATOR_ID = '0.0.11111';
    process.env.HEDERA_OPERATOR_KEY = 'mock-key';
    process.env.HEDERA_DEFAULT_TOKEN_ID = '0.0.99999';
    delete process.env.ACQUIS_REWARD_RATE_BPS;
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
      headers: webhookHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  it('webhook passes rewardUnits (50), not raw amountCents (5000), to transferToken', async () => {
    // amountCents=5000, rateBps=100 (default) → 5000*100/10000 = 50 units (0.50 AQT)
    await app.ready();
    (app as any).prisma.merchantConfig.findUnique.mockResolvedValueOnce(null);
    (app as any).prisma.fundingRequest.findUnique.mockResolvedValueOnce(mockFundingRequest);

    await app.inject({ method: 'POST', url: '/api/v1/fund/webhook', payload: '{}', headers: webhookHeaders });

    expect(getTransferToken()).toHaveBeenCalledWith('0.0.99999', '0.0.11111', 'mock-key', '0.0.12345', 50);
    expect(getTransferToken()).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), 5000,
    );
  });

  it('webhook skips transfer when reward floors to zero (55 cents at 100 bps = 0 units)', async () => {
    await app.ready();
    (app as any).prisma.merchantConfig.findUnique.mockResolvedValueOnce(null);
    (app as any).prisma.fundingRequest.findUnique.mockResolvedValueOnce({ ...mockFundingRequest, amountCents: 55 });

    await app.inject({ method: 'POST', url: '/api/v1/fund/webhook', payload: '{}', headers: webhookHeaders });

    expect(getTransferToken()).not.toHaveBeenCalled();
  });

  it('webhook uses merchantConfig.rewardRateBps when a config row exists', async () => {
    // merchantConfig row with 250 bps (2.5%): 5000*250/10000 = 125 units (1.25 AQT)
    await app.ready();
    (app as any).prisma.merchantConfig.findUnique.mockResolvedValueOnce({ rewardRateBps: 250 });
    (app as any).prisma.fundingRequest.findUnique.mockResolvedValueOnce(mockFundingRequest);

    await app.inject({ method: 'POST', url: '/api/v1/fund/webhook', payload: '{}', headers: webhookHeaders });

    expect(getTransferToken()).toHaveBeenCalledWith('0.0.99999', '0.0.11111', 'mock-key', '0.0.12345', 125);
  });

  it('webhook falls back to 100 bps when merchantConfig row is absent', async () => {
    // No config row and no ACQUIS_REWARD_RATE_BPS → default 100 bps → 50 units
    await app.ready();
    (app as any).prisma.merchantConfig.findUnique.mockResolvedValueOnce(null);
    (app as any).prisma.fundingRequest.findUnique.mockResolvedValueOnce(mockFundingRequest);

    await app.inject({ method: 'POST', url: '/api/v1/fund/webhook', payload: '{}', headers: webhookHeaders });

    expect(getTransferToken()).toHaveBeenCalledWith('0.0.99999', '0.0.11111', 'mock-key', '0.0.12345', 50);
  });
});
