import { validateTransaction } from '../src/validate';
import type {
  MerchantRuleSet, ProposedTransaction, EnforcementContext,
} from '../src/types';

// ── Fixtures ──────────────────────────────────────────────────────────────
function ruleSet(overrides: Partial<MerchantRuleSet> = {}): MerchantRuleSet {
  return {
    merchantId:   'merchant-1',
    merchantName: 'Test Merchant',
    hcsTopicId:   '0.0.9342744',
    version:      1,
    effectiveAt:  '2026-01-01T00:00:00Z',
    createdAt:    '2026-01-01T00:00:00Z',
    tier:         'starter',
    settlement: {
      preferredRail: 'xrpl', settlementAsset: 'xrp',
      custodialAddress: 'rTest', payoutSchedule: 'daily',
    },
    limits: {
      perTransaction: { maxAmountCents: 50000, minAmountCents: 50 },
      daily:          { maxAmountCents: 500000, maxTransactions: 200 },
      monthly:        { maxAmountCents: 10000000, maxTransactions: 4000 },
      perCustomer: {
        dailyMaxCents: 20000, weeklyMaxCents: 75000,
        monthlyMaxCents: 200000, maxTransactionsPerDay: 10,
      },
      velocity: { windowMinutes: 15, maxAmountCents: 30000, maxTransactions: 5 },
    },
    categories: { allowedCategories: [], blockedCategories: [], categoryLimits: {} },
    fraud: {
      duplicateWindow: { enabled: false, windowSeconds: 30 },
      blockedCustomers: [],
      highValueThreshold: { enabled: false, amountCents: 10000, requireConfirm: false },
      operatingHours: { enabled: false, timezone: 'UTC', openTime: '00:00', closeTime: '23:59', blockedDays: [] },
    },
    rewards: {
      model: 'A',
      earnRate: { rateBps: 100, setBy: 'platform_default', bonusMultiplier: 1 },
      redemption: { minBalanceToRedeem: 500, maxRedemptionPerTx: 1000, redemptionRateCents: 1 },
    },
    funding: {
      standingApproval: { enabled: false, maxAmountCents: 0, periodMaxCents: 0, periodHours: 0, requiresInvoiceMatch: false },
      autoRefund:       { enabled: false, thresholdCents: 0 },
      preferredRail:    'ach',
    },
    fallback: { settlementCascade: [], railTimeoutSeconds: 10, onAllRailsFailed: 'reject' },
    ...overrides,
  };
}

function tx(overrides: Partial<ProposedTransaction> = {}): ProposedTransaction {
  return {
    merchantId:       'merchant-1',
    customerId:       'acq_test_1',
    amountCents:      500,
    category:         undefined,
    timestamp:        '2026-07-13T12:00:00Z',
    isAgentInitiated: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<EnforcementContext> = {}): EnforcementContext {
  return {
    customerDailySpendCents:            0,
    customerWeeklySpendCents:           0,
    customerMonthlySpendCents:          0,
    customerTransactionsToday:          0,
    merchantDailySpendCents:            0,
    merchantDailyTransactions:          0,
    merchantMonthlySpendCents:          0,
    merchantMonthlyTransactions:        0,
    recentTransactionsInVelocityWindow: [],
    ...overrides,
  };
}

// ── Approvals ─────────────────────────────────────────────────────────────
describe('validateTransaction — approvals', () => {
  it('approves a transaction within all limits', () => {
    const r = validateTransaction(ruleSet(), tx(), ctx());
    expect(r.approved).toBe(true);
    expect(r.failedRules).toEqual([]);
    expect(r.merchantId).toBe('merchant-1');
    expect(r.ruleSetVersion).toBe(1);
    expect(r.hcsTopicId).toBe('0.0.9342744');
    expect(typeof r.evaluatedAt).toBe('string');
  });

  it('approved: true always has an empty failedRules array', () => {
    const r = validateTransaction(ruleSet(), tx(), ctx());
    expect(r.approved).toBe(true);
    expect(Array.isArray(r.failedRules)).toBe(true);
    expect(r.failedRules).toHaveLength(0);
  });
});

// ── Per-transaction min/max ───────────────────────────────────────────────
describe('validateTransaction — perTransaction limits', () => {
  it('rejects exceeding perTransaction.maxAmountCents', () => {
    const r = validateTransaction(ruleSet(), tx({ amountCents: 100000 }), ctx());
    expect(r.approved).toBe(false);
    expect(r.failedRules.some(f => f.field === 'perTransaction.maxAmountCents')).toBe(true);
  });

  it('rejects below perTransaction.minAmountCents', () => {
    const r = validateTransaction(ruleSet(), tx({ amountCents: 25 }), ctx());
    expect(r.approved).toBe(false);
    expect(r.failedRules.some(f => f.field === 'perTransaction.minAmountCents')).toBe(true);
  });
});

// ── Daily / monthly / velocity ────────────────────────────────────────────
describe('validateTransaction — daily/monthly/velocity', () => {
  it('rejects exceeding merchant daily spend', () => {
    const r = validateTransaction(ruleSet(), tx({ amountCents: 1000 }),
      ctx({ merchantDailySpendCents: 499500 }));
    expect(r.failedRules.some(f => f.field === 'daily.maxAmountCents')).toBe(true);
  });

  it('rejects exceeding merchant monthly transactions', () => {
    const r = validateTransaction(ruleSet(), tx(),
      ctx({ merchantMonthlyTransactions: 4000 }));
    expect(r.failedRules.some(f => f.field === 'monthly.maxTransactions')).toBe(true);
  });

  it('rejects exceeding perCustomer daily spend', () => {
    const r = validateTransaction(ruleSet(), tx({ amountCents: 1000 }),
      ctx({ customerDailySpendCents: 19500 }));
    expect(r.failedRules.some(f => f.field === 'perCustomer.dailyMaxCents')).toBe(true);
  });

  it('rejects exceeding perCustomer weekly spend', () => {
    const r = validateTransaction(ruleSet(), tx({ amountCents: 1000 }),
      ctx({ customerWeeklySpendCents: 74500 }));
    expect(r.failedRules.some(f => f.field === 'perCustomer.weeklyMaxCents')).toBe(true);
  });

  it('rejects exceeding perCustomer monthly spend', () => {
    const r = validateTransaction(ruleSet(), tx({ amountCents: 1000 }),
      ctx({ customerMonthlySpendCents: 199500 }));
    expect(r.failedRules.some(f => f.field === 'perCustomer.monthlyMaxCents')).toBe(true);
  });

  it('rejects exceeding perCustomer maxTransactionsPerDay', () => {
    const r = validateTransaction(ruleSet(), tx(),
      ctx({ customerTransactionsToday: 10 }));
    expect(r.failedRules.some(f => f.field === 'perCustomer.maxTransactionsPerDay')).toBe(true);
  });

  it('rejects exceeding velocity window amount', () => {
    const now = '2026-07-13T12:00:00Z';
    const inWin = { amountCents: 29500, timestamp: '2026-07-13T11:56:00Z' };
    const r = validateTransaction(ruleSet(), tx({ amountCents: 1000, timestamp: now }),
      ctx({ recentTransactionsInVelocityWindow: [inWin] }));
    expect(r.failedRules.some(f => f.field === 'velocity.maxAmountCents')).toBe(true);
  });

  it('rejects exceeding velocity window count', () => {
    const now = '2026-07-13T12:00:00Z';
    const inWin = Array.from({ length: 5 }, (_, i) => ({ amountCents: 100, timestamp: `2026-07-13T11:5${9 - i}:00Z` }));
    const r = validateTransaction(ruleSet(), tx({ amountCents: 100, timestamp: now }),
      ctx({ recentTransactionsInVelocityWindow: inWin }));
    expect(r.failedRules.some(f => f.field === 'velocity.maxTransactions')).toBe(true);
  });

  it('ignores transactions outside the velocity window', () => {
    const now = '2026-07-13T12:00:00Z';
    const outWin = { amountCents: 40000, timestamp: '2026-07-13T11:00:00Z' }; // 60 min ago, window=15
    const r = validateTransaction(ruleSet(), tx({ amountCents: 100, timestamp: now }),
      ctx({ recentTransactionsInVelocityWindow: [outWin] }));
    expect(r.failedRules.some(f => f.field.startsWith('velocity.'))).toBe(false);
  });
});

// ── Categories ────────────────────────────────────────────────────────────
describe('validateTransaction — categories', () => {
  it('rejects when category is in blockedCategories', () => {
    const rs = ruleSet({ categories: { allowedCategories: [], blockedCategories: ['fuel'], categoryLimits: {} } });
    const r = validateTransaction(rs, tx({ category: 'fuel' }), ctx());
    expect(r.failedRules.some(f => f.field === 'blockedCategories')).toBe(true);
  });

  it('rejects when category not in allowedCategories (when allowedCategories non-empty)', () => {
    const rs = ruleSet({ categories: { allowedCategories: ['food_beverage'], blockedCategories: [], categoryLimits: {} } });
    const r = validateTransaction(rs, tx({ category: 'retail' }), ctx());
    expect(r.failedRules.some(f => f.field === 'allowedCategories')).toBe(true);
  });

  it('approves when tx.category is undefined (category checks skipped)', () => {
    const rs = ruleSet({ categories: { allowedCategories: ['food_beverage'], blockedCategories: ['retail'], categoryLimits: {} } });
    const r = validateTransaction(rs, tx({ category: undefined }), ctx());
    expect(r.approved).toBe(true);
  });

  it('rejects when tx exceeds categoryLimits.perTransactionMax', () => {
    const rs = ruleSet({ categories: { allowedCategories: [], blockedCategories: [],
      categoryLimits: { food_beverage: { dailyMaxCents: 100000, perTransactionMax: 500 } } } });
    const r = validateTransaction(rs, tx({ category: 'food_beverage', amountCents: 1000 }), ctx());
    expect(r.failedRules.some(f => f.field.startsWith('categoryLimits.'))).toBe(true);
  });
});

// ── Fraud controls ────────────────────────────────────────────────────────
describe('validateTransaction — fraud controls', () => {
  it('rejects when customer is in blockedCustomers', () => {
    const rs = ruleSet({ fraud: { ...ruleSet().fraud, blockedCustomers: ['acq_test_1'] } });
    const r = validateTransaction(rs, tx(), ctx());
    expect(r.failedRules.some(f => f.field === 'blockedCustomers')).toBe(true);
  });

  it('rejects duplicate transaction within duplicateWindow.windowSeconds', () => {
    const rs = ruleSet({ fraud: { ...ruleSet().fraud, duplicateWindow: { enabled: true, windowSeconds: 30 } } });
    const r = validateTransaction(rs, tx({ timestamp: '2026-07-13T12:00:00Z' }),
      ctx({ lastTransactionSameAmountTimestamp: '2026-07-13T11:59:50Z' }));
    expect(r.failedRules.some(f => f.field === 'duplicateWindow.windowSeconds')).toBe(true);
  });

  it('does not reject when duplicate is outside the window', () => {
    const rs = ruleSet({ fraud: { ...ruleSet().fraud, duplicateWindow: { enabled: true, windowSeconds: 30 } } });
    const r = validateTransaction(rs, tx({ timestamp: '2026-07-13T12:00:00Z' }),
      ctx({ lastTransactionSameAmountTimestamp: '2026-07-13T11:59:00Z' }));
    expect(r.failedRules.some(f => f.field === 'duplicateWindow.windowSeconds')).toBe(false);
  });

  it('warns (but approves) when tx exceeds highValueThreshold with requireConfirm', () => {
    const rs = ruleSet({ fraud: { ...ruleSet().fraud,
      highValueThreshold: { enabled: true, amountCents: 5000, requireConfirm: true } } });
    const r = validateTransaction(rs, tx({ amountCents: 6000 }), ctx());
    expect(r.warnings.some(w => w.includes('requires customer confirmation'))).toBe(true);
    expect(r.approved).toBe(true);
  });

  it('rejects outside operatingHours (before openTime)', () => {
    const rs = ruleSet({ fraud: { ...ruleSet().fraud,
      operatingHours: { enabled: true, timezone: 'UTC', openTime: '09:00', closeTime: '17:00', blockedDays: [] } } });
    const r = validateTransaction(rs, tx({ timestamp: '2026-07-13T05:30:00Z' }), ctx());
    expect(r.failedRules.some(f => f.field === 'operatingHours.openTime')).toBe(true);
  });

  it('rejects on a blockedDays day', () => {
    // 2026-07-12 = Sunday
    const rs = ruleSet({ fraud: { ...ruleSet().fraud,
      operatingHours: { enabled: true, timezone: 'UTC', openTime: '00:00', closeTime: '23:59', blockedDays: ['sunday'] } } });
    const r = validateTransaction(rs, tx({ timestamp: '2026-07-12T12:00:00Z' }), ctx());
    expect(r.failedRules.some(f => f.field === 'operatingHours.blockedDays')).toBe(true);
  });
});

// ── Agent policy ──────────────────────────────────────────────────────────
describe('validateTransaction — agent policy', () => {
  it('rejects agent-initiated transactions when agentPolicy.enabled is false', () => {
    const rs = ruleSet(); // agentPolicy undefined
    const r = validateTransaction(rs, tx({ isAgentInitiated: true }), ctx());
    expect(r.failedRules.some(f => f.ruleGroup === 'agentPolicy' && f.field === 'enabled')).toBe(true);
  });

  it('rejects agent transaction exceeding bounds.maxPerTransactionCents', () => {
    const rs = ruleSet({ agentPolicy: {
      enabled: true, principalId: 'p1',
      bounds: { maxPerTransactionCents: 1000, maxDailySpendCents: 10000, maxMonthlySpendCents: 100000,
        allowedCategories: [], allowedMerchantIds: [], expiresAt: '2030-01-01T00:00:00Z' },
      attribution: { recordOnHCS: true, agentFramework: 'mcp', agentId: 'a1' },
      x402: { enabled: false, supportedAssets: [], maxPaymentAgeCents: 0 },
    } });
    const r = validateTransaction(rs, tx({ isAgentInitiated: true, amountCents: 5000 }), ctx());
    expect(r.failedRules.some(f => f.field === 'bounds.maxPerTransactionCents')).toBe(true);
  });

  it('rejects agent transaction after bounds.expiresAt', () => {
    const rs = ruleSet({ agentPolicy: {
      enabled: true, principalId: 'p1',
      bounds: { maxPerTransactionCents: 100000, maxDailySpendCents: 1000000, maxMonthlySpendCents: 10000000,
        allowedCategories: [], allowedMerchantIds: [], expiresAt: '2020-01-01T00:00:00Z' },
      attribution: { recordOnHCS: true, agentFramework: 'mcp', agentId: 'a1' },
      x402: { enabled: false, supportedAssets: [], maxPaymentAgeCents: 0 },
    } });
    const r = validateTransaction(rs, tx({ isAgentInitiated: true }), ctx());
    expect(r.failedRules.some(f => f.field === 'bounds.expiresAt')).toBe(true);
  });

  it('rejects agent tx to merchant not in allowedMerchantIds (when non-empty)', () => {
    const rs = ruleSet({ agentPolicy: {
      enabled: true, principalId: 'p1',
      bounds: { maxPerTransactionCents: 100000, maxDailySpendCents: 1000000, maxMonthlySpendCents: 10000000,
        allowedCategories: [], allowedMerchantIds: ['merchant-2'], expiresAt: '2030-01-01T00:00:00Z' },
      attribution: { recordOnHCS: true, agentFramework: 'mcp', agentId: 'a1' },
      x402: { enabled: false, supportedAssets: [], maxPaymentAgeCents: 0 },
    } });
    const r = validateTransaction(rs, tx({ isAgentInitiated: true }), ctx());
    expect(r.failedRules.some(f => f.field === 'bounds.allowedMerchantIds')).toBe(true);
  });
});

// ── Multiple failures ────────────────────────────────────────────────────
describe('validateTransaction — multiple failures', () => {
  it('reports ALL failing rules, not just the first', () => {
    const rs = ruleSet({
      categories: { allowedCategories: [], blockedCategories: ['fuel'], categoryLimits: {} },
    });
    const r = validateTransaction(rs, tx({ amountCents: 100000, category: 'fuel' }), ctx());
    expect(r.approved).toBe(false);
    expect(r.failedRules.length).toBeGreaterThan(1);
    expect(r.failedRules.some(f => f.field === 'perTransaction.maxAmountCents')).toBe(true);
    expect(r.failedRules.some(f => f.field === 'blockedCategories')).toBe(true);
  });
});
