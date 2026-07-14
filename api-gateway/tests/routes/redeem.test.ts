import { getApp, authHeader } from '../helpers';

// ── Mocks ─────────────────────────────────────────────────────────────────
jest.mock('@acquis/hedera-service', () => ({
  TransferService: {
    transferToken: jest.fn().mockResolvedValue(undefined),
  },
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id:             '0.0.9342744',
      sequence_number:      77,
      consensus_timestamp:  '2026-01-01T00:00:00Z',
      transaction_id:       '0.0.11111@1234567890.000000000',
    }),
  },
  NFTService: { mintCustodialNFT: jest.fn(), updateNFTMetadata: jest.fn() },
  getClient: jest.fn(),
}));

// ── Fixture data ───────────────────────────────────────────────────────────
const mockCustomer = {
  id:                      'cust-internal-1',
  acquisId:                'acq_testcustomer1',
  phone:                   '+15550001234',
  email:                   null,
  displayName:             'Test User',
  kycLevel:                'rewards_only',
  tier:                    'starter',
  aqsBalance:              500, // enough to redeem
  enrollingMerchantId:     'merchant-1',
  rewardsConsentGranted:   true,
  marketingConsentGranted: false,
  marketingConsentChannels: '[]',
  status:                  'active',
  createdAt:               new Date(),
  updatedAt:               new Date(),
};

const mockRedemptionEvent = {
  id:                'rde-1',
  acquisId:          'acq_testcustomer1',
  merchantId:        'merchant-1',
  redeemUnits:       200,
  redeemDisplay:     '2.00 AQT',
  valueCents:        200,
  externalRef:       null,
  hcsSequenceNumber: null,
  hcsTopicId:        null,
  status:            'pending',
  createdAt:         new Date(),
  updatedAt:         new Date(),
};

const mockActiveCode = {
  id:               'rdc-1',
  code:             'ABCD2345',
  redemptionEventId: 'rde-1',
  expiresAt:        new Date(Date.now() + 24 * 60 * 60 * 1000),
  usedAt:           null,
  usedByMerchantId: null,
  status:           'active',
  createdAt:        new Date(),
  redemptionEvent:  mockRedemptionEvent,
};

let customerStore = { ...mockCustomer };

// ── Prisma mock ────────────────────────────────────────────────────────────
jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        acquisCustomer: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.acquisId === mockCustomer.acquisId) return Promise.resolve(customerStore);
            return Promise.resolve(null);
          }),
          update: jest.fn().mockImplementation(({ data }: any) => {
            const decrement = data.aqsBalance?.decrement ?? 0;
            const newBalance = customerStore.aqsBalance - decrement;
            customerStore = { ...customerStore, aqsBalance: newBalance };
            return Promise.resolve({ aqsBalance: customerStore.aqsBalance });
          }),
        },
        redemptionEvent: {
          findUnique: jest.fn().mockResolvedValue(null),
          create:     jest.fn().mockResolvedValue(mockRedemptionEvent),
          update:     jest.fn().mockResolvedValue({ ...mockRedemptionEvent, hcsSequenceNumber: 77 }),
          findMany:   jest.fn().mockResolvedValue([{ ...mockRedemptionEvent, code: { status: 'active', usedAt: null, expiresAt: mockActiveCode.expiresAt } }]),
          count:      jest.fn().mockResolvedValue(1),
        },
        redemptionCode: {
          create:     jest.fn().mockResolvedValue(mockActiveCode),
          findUnique: jest.fn().mockResolvedValue(mockActiveCode),
          update:     jest.fn().mockResolvedValue({ ...mockActiveCode, status: 'used' }),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

function getHcsSubmit() {
  return (jest.requireMock('@acquis/hedera-service') as any).HCSService.submitMessage as jest.Mock;
}

describe('Redeem routes — Phase 4 Workstream B', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    customerStore = { ...mockCustomer, aqsBalance: 500 };
  });

  // ── POST /rewards/redeem — happy path ────────────────────────────────────
  it('issues a redemption code and deducts balance', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1', redeemUnits: 200 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.redeemUnits).toBe(200);
    expect(body.redeemDisplay).toBe('2.00 AQT');
    expect(body.valueCents).toBe(200);
    expect(typeof body.code).toBe('string');
    expect(body.code).toHaveLength(8);
    expect(body.newBalance).toBe(300); // 500 - 200
    expect(typeof body.expiresAt).toBe('string');
  });

  it('writes a reward.redeemed HCS message on success', async () => {
    await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1', redeemUnits: 100 },
      headers: authHeader,
    });
    const calls = getHcsSubmit().mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const msg = JSON.parse(calls[0][0].message);
    expect(msg.type).toBe('reward.redeemed');
    expect(msg.acquisId).toBe('acq_testcustomer1');
    expect(msg.redeemUnits).toBe(100);
  });

  it('returns hcsSequenceNumber from HCS write', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1', redeemUnits: 50 },
      headers: authHeader,
    });
    expect(res.json().hcsSequenceNumber).toBe(77);
  });

  // ── Insufficient balance ──────────────────────────────────────────────────
  it('returns 400 when redeemUnits exceeds balance', async () => {
    customerStore = { ...mockCustomer, aqsBalance: 50 };
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1', redeemUnits: 200 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Insufficient balance/);
  });

  // ── Customer not found ────────────────────────────────────────────────────
  it('returns 404 when acquisId is unknown', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_unknown', merchantId: 'merchant-1', redeemUnits: 100 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  // ── Validation ────────────────────────────────────────────────────────────
  it('returns 400 when redeemUnits is zero', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1', redeemUnits: 0 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/positive integer/);
  });

  it('returns 400 when redeemUnits is negative', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1', redeemUnits: -50 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────
  it('returns 409 on duplicate externalRef', async () => {
    (app as any).prisma.redemptionEvent.findUnique.mockResolvedValueOnce(mockRedemptionEvent);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1',
                 redeemUnits: 200, externalRef: 'ref-123' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/Duplicate externalRef/);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  it('returns 401 without x-api-key', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem',
      payload: { acquisId: 'acq_testcustomer1', merchantId: 'merchant-1', redeemUnits: 100 },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── POST /rewards/redeem/validate — happy path ───────────────────────────
  it('validates a code and marks it used', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem/validate',
      payload: { code: 'ABCD2345', merchantId: 'merchant-1' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acquisId).toBe('acq_testcustomer1');
    expect(body.redeemUnits).toBe(200);
    expect(body.redeemDisplay).toBe('2.00 AQT');
    expect(body.valueCents).toBe(200);
    expect(typeof body.validatedAt).toBe('string');
    expect(body.hcsSequenceNumber).toBe(77);
  });

  it('writes a redemption.validated HCS message on validate', async () => {
    await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem/validate',
      payload: { code: 'ABCD2345', merchantId: 'merchant-1' },
      headers: authHeader,
    });
    const calls = getHcsSubmit().mock.calls;
    const msg = JSON.parse(calls[0][0].message);
    expect(msg.type).toBe('redemption.validated');
    expect(msg.merchantId).toBe('merchant-1');
    expect(msg.redeemUnits).toBe(200);
  });

  // ── Code not found ────────────────────────────────────────────────────────
  it('returns 404 for unknown code', async () => {
    (app as any).prisma.redemptionCode.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem/validate',
      payload: { code: 'ZZZZZZZZ', merchantId: 'merchant-1' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  // ── Already used ──────────────────────────────────────────────────────────
  it('returns 409 for an already-used code', async () => {
    (app as any).prisma.redemptionCode.findUnique.mockResolvedValueOnce({
      ...mockActiveCode, status: 'used', usedAt: new Date(),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem/validate',
      payload: { code: 'ABCD2345', merchantId: 'merchant-1' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/already used/);
  });

  // ── Expired code ──────────────────────────────────────────────────────────
  it('returns 410 for an expired code', async () => {
    (app as any).prisma.redemptionCode.findUnique.mockResolvedValueOnce({
      ...mockActiveCode, expiresAt: new Date(Date.now() - 1000), status: 'active',
      redemptionEvent: mockRedemptionEvent,
    });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/rewards/redeem/validate',
      payload: { code: 'ABCD2345', merchantId: 'merchant-1' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(410);
    expect(res.json().message).toMatch(/expired/);
  });

  // ── GET /customers/:acquisId/redemptions ─────────────────────────────────
  it('returns paginated redemption history for a customer', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customers/acq_testcustomer1/redemptions',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acquisId).toBe('acq_testcustomer1');
    expect(body.total).toBe(1);
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('returns 404 for unknown customer in redemption history', async () => {
    (app as any).prisma.acquisCustomer.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customers/acq_unknown/redemptions',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });
});
