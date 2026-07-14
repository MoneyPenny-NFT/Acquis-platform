// Types for the enforcement engine. These are the canonical shapes
// (Merchant Rule Schema v1.1). Both the pure function core and any
// caller (stubAdapter today; SmartNode/Hooks/smart-contract adapter later)
// import from here.

export type MerchantTier = 'starter' | 'growth' | 'professional';

export interface SettlementConfig {
  preferredRail:    'xrpl' | 'hedera';
  settlementAsset:  'xrp' | 'rlusd' | 'hbar' | 'hts';
  custodialAddress: string;
  payoutSchedule:   'instant' | 'daily' | 'weekly';
}

export interface TransactionLimits {
  perTransaction: { maxAmountCents: number; minAmountCents: number };
  daily:          { maxAmountCents: number; maxTransactions: number };
  monthly:        { maxAmountCents: number; maxTransactions: number };
  perCustomer: {
    dailyMaxCents:         number;
    weeklyMaxCents:        number;
    monthlyMaxCents:       number;
    maxTransactionsPerDay: number;
  };
  velocity: {
    windowMinutes:   number;
    maxAmountCents:  number;
    maxTransactions: number;
  };
}

export type MerchantCategory =
  | 'food_beverage' | 'retail' | 'health_wellness' | 'home_services'
  | 'professional_services' | 'entertainment' | 'travel' | 'fuel'
  | 'utilities' | 'other';

export interface CategoryRules {
  allowedCategories: MerchantCategory[];
  blockedCategories: MerchantCategory[];
  categoryLimits: {
    [category in MerchantCategory]?: { dailyMaxCents: number; perTransactionMax: number };
  };
}

export type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface FraudControls {
  duplicateWindow: { enabled: boolean; windowSeconds: number };
  blockedCustomers: string[];
  highValueThreshold: { enabled: boolean; amountCents: number; requireConfirm: boolean };
  operatingHours: {
    enabled: boolean;
    timezone: string;
    openTime: string;   // 'HH:MM' local to timezone
    closeTime: string;  // 'HH:MM' local to timezone
    blockedDays: WeekDay[];
  };
}

export interface RewardsConfig {
  model: 'A' | 'B' | 'none';
  earnRate: {
    rateBps:         number;
    setBy:           'platform_default' | 'merchant_configured';
    updatedAt?:      string;
    bonusMultiplier: number;
  };
  redemption: {
    minBalanceToRedeem:  number;
    maxRedemptionPerTx:  number;
    redemptionRateCents: number;
  };
  networkMembership?: {
    enrolledAt:              string;
    networkId:               string;
    crossMerchantFeePercent: number;
  };
}

export interface FundingRules {
  standingApproval: {
    enabled:              boolean;
    maxAmountCents:       number;
    periodMaxCents:       number;
    periodHours:          number;
    requiresInvoiceMatch: boolean;
  };
  autoRefund:    { enabled: boolean; thresholdCents: number };
  preferredRail: 'rtp' | 'fedwire' | 'ach' | 'stripe';
}

export interface AgentPolicy {
  enabled:     boolean;
  principalId: string;
  bounds: {
    maxPerTransactionCents: number;
    maxDailySpendCents:     number;
    maxMonthlySpendCents:   number;
    allowedCategories:      MerchantCategory[];
    allowedMerchantIds:     string[];
    expiresAt:              string;
  };
  attribution: {
    recordOnHCS:    boolean;
    agentFramework: 'mcp' | 'langchain' | 'crewai' | 'other';
    agentId:        string;
  };
  x402: {
    enabled:            boolean;
    supportedAssets:    ('xrp' | 'rlusd')[];
    maxPaymentAgeCents: number;
  };
}

export interface SettlementOption {
  rail:     'xrpl' | 'hedera' | 'fedwire' | 'ach';
  asset:    'xrp' | 'rlusd' | 'hbar' | 'usd';
  priority: number;
  conditions?: { maxAmountCents?: number; minAmountCents?: number; requiredAsset?: string };
}

export interface FallbackPolicy {
  settlementCascade:  SettlementOption[];
  railTimeoutSeconds: number;
  onAllRailsFailed:   'reject' | 'queue' | 'notify_merchant';
}

export interface MerchantRuleSet {
  merchantId:    string;
  merchantName:  string;
  hcsTopicId:    string;
  version:       number;
  effectiveAt:   string;
  createdAt:     string;
  tier:          MerchantTier;
  settlement:    SettlementConfig;
  limits:        TransactionLimits;
  categories:    CategoryRules;
  fraud:         FraudControls;
  rewards:       RewardsConfig;
  funding:       FundingRules;
  agentPolicy?:  AgentPolicy;
  fallback:      FallbackPolicy;
}

export interface FailedRule {
  ruleGroup:   keyof MerchantRuleSet;
  field:       string;
  reason:      string;
  actualValue: number | string;
  limitValue:  number | string;
}

export interface RuleValidationResult {
  approved:       boolean;
  merchantId:     string;
  ruleSetVersion: number;
  hcsTopicId:     string;
  evaluatedAt:    string;
  failedRules:    FailedRule[];
  warnings:       string[];
  onChainProof?:  { hcsSequenceNumber: number; hcsConsensusTimestamp: string };
}

export interface ProposedTransaction {
  merchantId:       string;
  customerId:       string;
  amountCents:      number;
  category?:        MerchantCategory;
  timestamp:        string;
  isAgentInitiated: boolean;
  agentId?:         string;
  x402PaymentAge?:  number;
}

// Context is gathered by the caller (Component C) from EnforcementLog +
// blocked-customers set. Kept as plain data so the engine is pure.
export interface EnforcementContext {
  customerDailySpendCents:            number;
  customerWeeklySpendCents:           number;
  customerMonthlySpendCents:          number;
  customerTransactionsToday:          number;
  merchantDailySpendCents:            number;
  merchantDailyTransactions:          number;
  merchantMonthlySpendCents:          number;
  merchantMonthlyTransactions:        number;
  recentTransactionsInVelocityWindow: { amountCents: number; timestamp: string }[];
  lastTransactionSameAmountTimestamp?: string;
}
