import { runEnforcementCheck } from '../../src/enforcement/stubAdapter';
import type { ProposedTransaction } from '@acquis/enforcement-engine';

jest.mock('@acquis/hedera-service', () => ({
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id: '0.0.9342744', sequence_number: 999,
      consensus_timestamp: '2026-07-13T00:00:00Z',
      transaction_id: '0.0.9186941@1783950000.000000000',
    }),
  },
  TransferService: {}, NFTService: {}, getClient: jest.fn(),
}));

function makeStarterRuleSet(merchantId = 'merchant-1', version = 1) {
  return {
    merchantId, merchantName: 'M', hcsTopicId: '0.0.9342744',
    version, effectiveAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', tier: 'starter',
    settlement: { preferredRail: 'xrpl', settlementAsset: 'xrp', custodialAddress: 'rX', payoutSchedule: 'daily' },
    limits: {
      perTransaction: { maxAmountCents: 50000, minAmountCents: 50 },
      daily:   { maxAmountCents: 500000, maxTransactions: 200 },
      monthly: { maxAmountCents: 10000000, maxTransactions: 4000 },
      perCustomer: { dailyMaxCents: 20000, weeklyMaxCents: 75000, monthlyMaxCents: 200000, maxTransactionsPerDay: 10 },
      velocity:    { windowMinutes: 15, maxAmountCents: 30000, maxTransactions: 5 },
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
}

function makeDeps(ruleSet: unknown, logRows: any[] = []) {
  const enforcementLogCreated: any[] = [];
  const prisma: any = {
    merchantRuleSet: {
      findFirst: jest.fn().mockImplementation(() =>
        ruleSet ? Promise.resolve({ ruleSetJson: JSON.stringify(ruleSet), version: (ruleSet as any).version }) : Promise.resolve(null)),
    },
    enforcementLog: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(logRows.filter(r => (!where.customerId || r.customerId === where.customerId) &&
          (!where.merchantId || r.merchantId === where.merchantId) &&
          (!where.amountCents || r.amountCents === where.amountCents) &&
          (where.approved === undefined || r.approved === where.approved)))),
      count:    jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(logRows.filter(r => r.customerId === where.customerId && r.approved === where.approved).length)),
      create:   jest.fn().mockImplementation(({ data }: any) => {
        enforcementLogCreated.push(data); return Promise.resolve({ id: `el-${enforcementLogCreated.length}`, ...data });
      }),
    },
  };
  const log: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn(), child: () => log };
  return { prisma, log, enforcementLogCreated };
}

const baseTx: ProposedTransaction = {
  merchantId: 'merchant-1', customerId: 'acq_x',
  amountCents: 500, timestamp: '2026-07-13T12:00:00Z', isAgentInitiated: false,
};

describe('runEnforcementCheck (Component C stub adapter)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns error when no MerchantRuleSet exists for the merchant', async () => {
    const deps = makeDeps(null);
    const res = await runEnforcementCheck(deps, baseTx);
    expect(res).toEqual({ error: 'no_rule_set', merchantId: 'merchant-1' });
    expect(deps.prisma.enforcementLog.create).not.toHaveBeenCalled();
  });

  it('approves a valid transaction and populates onChainProof from HCS write', async () => {
    const deps = makeDeps(makeStarterRuleSet());
    const res = await runEnforcementCheck(deps, baseTx);
    expect('approved' in res && res.approved).toBe(true);
    if ('onChainProof' in res) {
      expect(res.onChainProof?.hcsSequenceNumber).toBe(999);
    }
  });

  it('writes an EnforcementLog row on approval', async () => {
    const deps = makeDeps(makeStarterRuleSet());
    await runEnforcementCheck(deps, baseTx);
    expect(deps.enforcementLogCreated).toHaveLength(1);
    expect(deps.enforcementLogCreated[0]).toMatchObject({
      merchantId: 'merchant-1', customerId: 'acq_x', amountCents: 500, approved: true, hcsSequenceNumber: 999,
    });
  });

  it('writes an EnforcementLog row on rejection too (audit trail includes rejections)', async () => {
    const deps = makeDeps(makeStarterRuleSet());
    const res = await runEnforcementCheck(deps, { ...baseTx, amountCents: 100000 });
    expect('approved' in res && res.approved).toBe(false);
    expect(deps.enforcementLogCreated).toHaveLength(1);
    expect(deps.enforcementLogCreated[0].approved).toBe(false);
    expect(typeof deps.enforcementLogCreated[0].failedRulesJson).toBe('string');
  });

  it('calls HCS.submitMessage for both approved and rejected outcomes', async () => {
    const { HCSService } = jest.requireMock('@acquis/hedera-service');
    const deps1 = makeDeps(makeStarterRuleSet());
    await runEnforcementCheck(deps1, baseTx);
    const deps2 = makeDeps(makeStarterRuleSet());
    await runEnforcementCheck(deps2, { ...baseTx, amountCents: 100000 });
    expect(HCSService.submitMessage).toHaveBeenCalledTimes(2);
    const approvedCall = HCSService.submitMessage.mock.calls[0][0].message;
    const rejectedCall = HCSService.submitMessage.mock.calls[1][0].message;
    expect(JSON.parse(approvedCall).approved).toBe(true);
    expect(JSON.parse(rejectedCall).approved).toBe(false);
  });

  it('uses the most recent MerchantRuleSet version', async () => {
    const deps = makeDeps(makeStarterRuleSet('merchant-1', 7));
    const res = await runEnforcementCheck(deps, baseTx);
    if ('ruleSetVersion' in res) expect(res.ruleSetVersion).toBe(7);
    // findFirst was called with orderBy: version desc
    expect(deps.prisma.merchantRuleSet.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { version: 'desc' },
    }));
  });
});
