import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id: '0.0.9342744', sequence_number: 42,
      consensus_timestamp: '2026-07-13T00:00:00Z',
      transaction_id: '0.0.9186941@1783950000.000000000',
    }),
  },
  TransferService: {}, NFTService: {}, getClient: jest.fn(),
}));
jest.mock('@acquis/xrpl-service');

let merchantStore: any = { id: 'merchant-1', legalName: 'Test M' };
let ruleStore: any[] = [];

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        merchant: {
          findUnique: jest.fn().mockImplementation(({ where }: any) =>
            Promise.resolve(where.id === merchantStore.id ? merchantStore : null)),
        },
        merchantRuleSet: {
          findFirst: jest.fn().mockImplementation(({ where, orderBy }: any) => {
            const rows = ruleStore.filter(r => r.merchantId === where.merchantId);
            if (orderBy?.version === 'desc') rows.sort((a,b) => b.version - a.version);
            return Promise.resolve(rows[0] ?? null);
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const key = where.merchantId_version;
            const row = ruleStore.find(r => r.merchantId === key.merchantId && r.version === key.version);
            return Promise.resolve(row ?? null);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const row = { id: `mrs-${ruleStore.length + 1}`, createdAt: new Date(), ...data };
            ruleStore.push(row);
            return Promise.resolve(row);
          }),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

const RS_BODY = {
  merchantName: 'Test M', effectiveAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z',
  tier: 'starter',
  settlement: { preferredRail: 'xrpl', settlementAsset: 'xrp', custodialAddress: 'rX', payoutSchedule: 'daily' },
  limits: {
    perTransaction: { maxAmountCents: 50000, minAmountCents: 50 },
    daily: { maxAmountCents: 500000, maxTransactions: 200 },
    monthly: { maxAmountCents: 10000000, maxTransactions: 4000 },
    perCustomer: { dailyMaxCents: 20000, weeklyMaxCents: 75000, monthlyMaxCents: 200000, maxTransactionsPerDay: 10 },
    velocity: { windowMinutes: 15, maxAmountCents: 30000, maxTransactions: 5 },
  },
  categories: { allowedCategories: [], blockedCategories: [], categoryLimits: {} },
  fraud: {
    duplicateWindow: { enabled: false, windowSeconds: 30 },
    blockedCustomers: [],
    highValueThreshold: { enabled: false, amountCents: 10000, requireConfirm: false },
    operatingHours: { enabled: false, timezone: 'UTC', openTime: '00:00', closeTime: '23:59', blockedDays: [] },
  },
  rewards: { model: 'A', earnRate: { rateBps: 100, setBy: 'platform_default', bonusMultiplier: 1 },
    redemption: { minBalanceToRedeem: 500, maxRedemptionPerTx: 1000, redemptionRateCents: 1 } },
  funding: { standingApproval: { enabled: false, maxAmountCents: 0, periodMaxCents: 0, periodHours: 0, requiresInvoiceMatch: false },
    autoRefund: { enabled: false, thresholdCents: 0 }, preferredRail: 'ach' },
  fallback: { settlementCascade: [], railTimeoutSeconds: 10, onAllRailsFailed: 'reject' },
};

describe('MerchantRuleSet routes (Component A)', () => {
  const app = getApp();
  afterAll(() => app.close());
  beforeEach(() => { ruleStore = []; jest.clearAllMocks(); });

  it('POST /merchants/:id/rules creates v1 and writes HCS record', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchants/merchant-1/rules',
      payload: RS_BODY, headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.version).toBe(1);
    expect(body.hcsSequenceNumber).toBe(42);
    expect(body.hcsTopicId).toBe('0.0.9342744');
  });

  it('POST second rule set — version increments to 2', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: RS_BODY, headers: authHeader });
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: RS_BODY, headers: authHeader });
    expect(res.statusCode).toBe(201);
    expect(res.json().version).toBe(2);
  });

  it('GET /merchants/:id/rules/current returns latest version', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: RS_BODY, headers: authHeader });
    await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: RS_BODY, headers: authHeader });
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants/merchant-1/rules/current', headers: authHeader });
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(2);
    expect(res.json().ruleSet.tier).toBe('starter');
  });

  it('GET /merchants/:id/rules/:version returns exact historical version', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: RS_BODY, headers: authHeader });
    await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: RS_BODY, headers: authHeader });
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants/merchant-1/rules/1', headers: authHeader });
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(1);
  });

  it('older versions are immutable — creating v2 does not alter v1 payload', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: RS_BODY, headers: authHeader });
    const v1before = ruleStore[0].ruleSetJson;
    await app.inject({ method: 'POST', url: '/api/v1/merchants/merchant-1/rules', payload: { ...RS_BODY, tier: 'growth' }, headers: authHeader });
    const v1after = ruleStore.find(r => r.version === 1)!.ruleSetJson;
    expect(v1after).toBe(v1before);
  });

  it('GET current returns 404 when no rules exist for merchant', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants/merchant-1/rules/current', headers: authHeader });
    expect(res.statusCode).toBe(404);
  });

  it('POST returns 404 for unknown merchant', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchants/does-not-exist/rules',
      payload: RS_BODY, headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });
});
