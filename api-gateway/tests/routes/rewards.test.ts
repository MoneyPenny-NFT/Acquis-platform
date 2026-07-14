import { getApp, authHeader } from '../helpers';

// ── Mocks ─────────────────────────────────────────────────────────────────
jest.mock('@acquis/hedera-service', () => ({
  TransferService: {
    transferToken: jest.fn().mockResolvedValue(undefined),
    transferHbar:  jest.fn().mockResolvedValue(undefined),
  },
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id:          '0.0.9342744',
      sequence_number:   42,
      consensus_timestamp: '2026-01-01T00:00:00Z',
      transaction_id:    '0.0.11111@1234567890.000000000',
    }),
  },
  NFTService: {
    mintCustodialNFT: jest.fn().mockResolvedValue({
      token_id:            '0.0.9342217',
      serial_number:       1,
      tx_id:               'mock-tx-id',
      hcs_topic_id:        '0.0.9342744',
      hcs_sequence_number: 1,
    }),
    updateNFTMetadata: jest.fn().mockResolvedValue({ tx_id: 'mock-update-tx' }),
  },
  getClient: jest.fn(),
}));

// ── Prisma mock ────────────────────────────────────────────────────────────
const mockCustomer = {
  id:              'cust-internal-1',
  acquisId:        'acq_testcustomer1',
  phone:           '+15550001234',
  email:           null,
  displayName:     'Test User',
  hederaNftTokenId: null,
  hederaNftSerial:  null,
  kycLevel:        'rewards_only',
  tier:            'starter',
  aqsBalance:      0,
  enrollingMerchantId: 'merchant-1',
  rewardsConsentGranted: true,
  marketingConsentGranted: false,
  marketingConsentChannels: '[]',
  status:          'active',
  createdAt:       new Date(),
  updatedAt:       new Date(),
};

const mockRewardEvent = {
  id:                'evt-1',
  merchantId:        'merchant-1',
  customerId:        'acq_testcustomer1',
  eventType:         'purchase',
  amountCents:       5000,
  rewardUnits:       50,
  externalRef:       'ext-ref-1',
  hcsSequenceNumber: 42,
  status:            'completed',
  createdAt:         new Date(),
};

let customerStore = { ...mockCustomer };

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        merchantConfig: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        acquisCustomer: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.acquisId === mockCustomer.acquisId) return Promise.resolve(customerStore);
            if (where.phone === mockCustomer.phone)       return Promise.resolve(customerStore);
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const c = { ...mockCustomer, ...data, acquisId: data.acquisId ?? 'acq_new123' };
            customerStore = c;
            return Promise.resolve(c);
          }),
          update: jest.fn().mockImplementation(({ data }: any) => {
            customerStore = { ...customerStore, ...data };
            return Promise.resolve(customerStore);
          }),
          findMany: jest.fn().mockResolvedValue([customerStore]),
          count:    jest.fn().mockResolvedValue(1),
        },
        rewardEvent: {
          findFirst:  jest.fn().mockResolvedValue(null),
          create:     jest.fn().mockResolvedValue(mockRewardEvent),
          findMany:   jest.fn().mockResolvedValue([mockRewardEvent]),
          count:      jest.fn().mockResolvedValue(1),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────
function getTransferToken() {
  return (jest.requireMock('@acquis/hedera-service') as any).TransferService.transferToken as jest.Mock;
}
function getHcsSubmit() {
  return (jest.requireMock('@acquis/hedera-service') as any).HCSService.submitMessage as jest.Mock;
}

describe('Rewards routes — Phase 1', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    customerStore = { ...mockCustomer, aqsBalance: 0 };
    process.env.HEDERA_OPERATOR_ID  = '0.0.11111';
    process.env.HEDERA_OPERATOR_KEY = 'mock-key';
    process.env.HEDERA_DEFAULT_TOKEN_ID = '0.0.9199123';
  });

  // ── POST /rewards/credit — purchase ──────────────────────────────────────
  it('credits correct reward units for a purchase event via merchant rateBps', async () => {
    // 5000 cents * 100 bps / 10000 = 50 units (0.50 AQT)
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'acq_testcustomer1',
                 eventType: 'purchase', amountCents: 5000, externalRef: 'ext-001' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rewardUnits).toBe(50);
    expect(body.rewardDisplay).toBe('0.50 AQT');
    expect(body.hcsSequenceNumber).toBe(42);
  });

  it('purchase event uses merchant-specific rateBps when config row exists', async () => {
    // 250 bps: 5000 * 250 / 10000 = 125 units
    (app as any).prisma.merchantConfig.findUnique
      .mockResolvedValueOnce({ rewardRateBps: 250 });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'acq_testcustomer1',
                 eventType: 'purchase', amountCents: 5000 },
      headers: authHeader,
    });
    expect(res.json().rewardUnits).toBe(125);
  });

  // ── POST /rewards/credit — non-purchase events ───────────────────────────
  it('credits fixedRewardUnits for a checkin event (no amountCents needed)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'acq_testcustomer1',
                 eventType: 'checkin', fixedRewardUnits: 25 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().rewardUnits).toBe(25);
  });

  it('returns 400 when fixedRewardUnits missing for non-purchase event', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'acq_testcustomer1',
                 eventType: 'checkin' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Zero-guard ────────────────────────────────────────────────────────────
  it('zero-guard: sub-unit purchase skips Hedera transfer and returns 0 units', async () => {
    // 55 cents * 100 bps / 10000 = 0.55 → floor = 0
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'acq_testcustomer1',
                 eventType: 'purchase', amountCents: 55 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rewardUnits).toBe(0);
    expect(getTransferToken()).not.toHaveBeenCalled();
  });

  // ── Idempotency ───────────────────────────────────────────────────────────
  it('rejects duplicate externalRef within 24h', async () => {
    (app as any).prisma.rewardEvent.findFirst.mockResolvedValueOnce(mockRewardEvent);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'acq_testcustomer1',
                 eventType: 'purchase', amountCents: 5000, externalRef: 'ext-ref-1' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/Duplicate externalRef/);
  });

  // ── HCS write ─────────────────────────────────────────────────────────────
  it('writes a reward.credited HCS event for every non-zero credit', async () => {
    await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'acq_testcustomer1',
                 eventType: 'purchase', amountCents: 5000 },
      headers: authHeader,
    });
    const calls = getHcsSubmit().mock.calls;
    const msg = JSON.parse(calls[0][0].message);
    expect(msg.type).toBe('reward.credited');
    expect(msg.merchantId).toBe('merchant-1');
    expect(msg.rewardUnits).toBe(50);
  });

  // ── Guest / lazy enrollment ───────────────────────────────────────────────
  it('auto-enrolls a guest customer by phone and credits reward in one call', async () => {
    (app as any).prisma.acquisCustomer.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1',
                 customerContact: { phone: '+15550009999' },
                 eventType: 'purchase', amountCents: 1000 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().rewardUnits).toBe(10);
    expect((app as any).prisma.acquisCustomer.create).toHaveBeenCalled();
  });

  // ── Existing customer match ───────────────────────────────────────────────
  it('credits existing customer when phone matches — no duplicate enrollment', async () => {
    const createSpy = (app as any).prisma.acquisCustomer.create as jest.Mock;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1',
                 customerContact: { phone: '+15550001234' },  // matches mockCustomer
                 eventType: 'checkin', fixedRewardUnits: 25 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    expect(createSpy).not.toHaveBeenCalled();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  it('returns 401 without x-api-key', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/credit',
      payload: { merchantId: 'merchant-1', customerId: 'x', eventType: 'checkin', fixedRewardUnits: 10 },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── GET summary ───────────────────────────────────────────────────────────
  it('GET /merchants/:id/rewards/summary returns metric totals', async () => {
    (app as any).prisma.rewardEvent.findMany.mockResolvedValue([{ rewardUnits: 50 }, { rewardUnits: 75 }]);
    (app as any).prisma.acquisCustomer.findMany.mockResolvedValue([{ acquisId: 'a', aqsBalance: 100 }]);
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchants/merchant-1/rewards/summary',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.merchantId).toBe('merchant-1');
    expect(typeof body.activeCustomers).toBe('number');
  });

  // ── GET customer balance ──────────────────────────────────────────────────
  it('GET /customers/:id/rewards/balance returns balance and history', async () => {
    (app as any).prisma.acquisCustomer.findUnique.mockResolvedValueOnce({
      ...mockCustomer, aqsBalance: 150,
      rewardEvents: [mockRewardEvent],
    });
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customers/acq_testcustomer1/rewards/balance',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.aqsBalance).toBe(150);
    expect(body.balanceDisplay).toBe('1.50 AQT');
  });

  it('GET /customers/:id/rewards/balance returns 404 for unknown customer', async () => {
    (app as any).prisma.acquisCustomer.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customers/acq_unknown/rewards/balance',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /customers/:id/rewards/balance includes consent fields', async () => {
    (app as any).prisma.acquisCustomer.findUnique.mockResolvedValueOnce({
      ...mockCustomer, aqsBalance: 0, rewardEvents: [],
    });
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customers/acq_testcustomer1/rewards/balance',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.rewardsConsentGranted).toBe('boolean');
    expect(Array.isArray(body.marketingConsentChannels)).toBe(true);
  });

  // ── PATCH /customers/:id/preferences ─────────────────────────────────────
  it('PATCH /customers/:id/preferences updates marketing consent', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/customers/acq_testcustomer1/preferences',
      payload: { marketingConsent: true, marketingChannels: ['sms'] },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acquisId).toBe('acq_testcustomer1');
    expect(body.marketingConsentGranted).toBe(true);
    expect(Array.isArray(body.marketingConsentChannels)).toBe(true);
  });

  it('PATCH /customers/:id/preferences returns 404 for unknown customer', async () => {
    (app as any).prisma.acquisCustomer.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/customers/acq_unknown/preferences',
      payload: { marketingConsent: false },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /customers/:id/preferences returns 400 when body is empty', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/customers/acq_testcustomer1/preferences',
      payload: {},
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });
});
