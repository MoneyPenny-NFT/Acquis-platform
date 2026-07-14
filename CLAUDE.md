# Acquis BaaS Platform — Build Instructions

## Project
Acquis is a multi-chain Banking-as-a-Service platform built on Hedera Hashgraph and XRPL.
Patent pending — 56 claims filed USPTO.
FinCEN MSB registered — prepaid access provider.

## Permissions
You have permission to:
- Read and write all files in this project
- Install npm packages
- Run node, npm, and npx commands
- Create and modify configuration files
- Write and run tests
- Create environment variable template files (.env.example)

You do NOT have permission to:
- Commit or push to git without being asked
- Send any real API calls to Hedera mainnet (testnet only)
- Store real private keys or credentials in any file
- Deploy to any server without being asked

## Technology stack
- Runtime: Node.js 20+ with TypeScript
- Hedera SDK: @hashgraph/sdk
- HSuite SDK: @hsuite/smart-node-sdk
- API: Fastify
- Frontend: React 18 with Tailwind CSS
- Database: PostgreSQL via Prisma ORM
- Queue: Bull (Redis-backed job queue)
- Testing: Jest

## Environment
All Hedera operations use TESTNET only.
Operator account and key come from environment variables.
Never hardcode credentials.

## Build order
1. hedera-service — build this first, all other components depend on it
2. api-gateway — builds on top of hedera-service
3. merchant-dashboard — frontend for merchants
4. pos-terminal — POS interface
5. card-sdk — embeddable SDK last
6. funding-service — push payment / ACH funding rail
7. credential-service — dual-object identity system (Hedera NFT + XRPL Credential)

## Credential system (multi-chain identity)

### Hedera side — Dynamic NFT (HIP-657)
- One NFT per customer, minted by Acquis treasury, transferred to customer
- TokenType: NON_FUNGIBLE_UNIQUE via HTS; metadata key = operator key
- Metadata updated after every settled transaction, on tier change, on network
  membership change, and on agent policy update via TokenUpdateNftsTransaction
- Never burn a customer NFT — set status: 'suspended' in metadata instead

### XRPL side — Credentials (XLS-70, confirmed active on testnet)
- Acquis operates one XRPL issuer account (XRPL_CREDENTIAL_ISSUER_ADDRESS)
- CredentialType: "AcquisMember" (hex-encoded on ledger)
- Credential URI: "hedera:{tokenId}/{serial}" (cross-chain link)
- CredentialCreate / CredentialDelete / DepositPreauth+AuthorizeCredentials
  require xrpl@4 — currently stubbed, same upgrade track as x402-xrpl
- verifyCredential is real: uses raw ledger_entry RPC which works in xrpl@3

### What does NOT change
- SmartNode validation still gates every transaction
- HCS still writes every settlement record
- pay.ts lines 19-91 — DO NOT TOUCH under any circumstances
- @noble/hashes overrides in root package.json — DO NOT TOUCH
- x402 mode stub — DO NOT TOUCH
- SmartNode gateway — DO NOT TOUCH
- funding-service RfP state machine — DO NOT TOUCH

## HCS message reading — chunking is not optional

HCS submits messages larger than roughly 1024 bytes as MULTIPLE consecutive
sequence numbers, not one. Every chunk shares one `initial_transaction_id`
(seen inside `chunk_info` on the mirror-node response); the first chunk
carries `chunk_info.number = 1` and `chunk_info.total = N`. Reading only
the seeded sequence number when `total > 1` gets a TRUNCATED payload —
your JSON.parse either throws or, worse, silently succeeds on partial
data if the boundary happens to land at a valid JSON prefix.

Empirically confirmed on testnet 2026-07-13: an
`enforcement.evaluation` record with six `failedRules` was 1368 bytes
and auto-split into HCS sequences 31 + 32 on topic 0.0.9342744 —
sharing `initial_transaction_id 0.0.9186941@1783975686.044855035`.

### Use the shared reader — never hand-roll fetch/base64/parse

`@acquis/hedera-service` exports two helpers that DO chunk stitching:

- `readHcsMessage(topicId, sequenceNumber)` → `HcsMessage` with `.text`
  containing the fully assembled utf-8 payload. Use this for any
  non-JSON payload or when you need chunk metadata.
- `readHcsJson<T>(topicId, sequenceNumber)` → parsed JSON. Same
  guarantees under the hood.

The stitcher verifies each subsequent chunk carries the same
`initial_transaction_id` before concatenation, so if you point it at
a sequence number that's part of a different message it fails loud
rather than assembling garbage.

Applies to every consumer that reads HCS records back for display,
audit, analytics, or reconstruction:
- enforcement evaluation records (`type: 'enforcement.evaluation'`)
- QR-enrollment consent records (`type: 'qr_enrollment.consent'`)
- merchant agreement records (`type: 'merchant.agreement.signed'`)
- credential lifecycle records (`type: 'reward.credited'`, etc.)
- NFT metadata refs (already migrated to the shared reader)

If you're writing new code that fetches an HCS message, use these
helpers. Do not add a fresh `fetch(...api/v1/topics/.../messages/N)`
call anywhere; the linting expectation is that the mirror-node URL
appears in `hedera-service/src/services/hcs.service.ts` only.

## Dependencies installed with intentionally-unused state

Some packages are declared in `package.json` but currently have zero
source imports. They are staged for planned future integration —
do NOT remove them as part of dependency cleanup passes.

- **`x402-xrpl`** (declared in `xrpl-service/package.json` line 16
  and `api-gateway/package.json` line 29) — installed but not yet
  wired. Real x402 protocol verification is a separate dedicated
  session and was confirmed as still-stubbed in the earlier xrpl@4
  upgrade status audit (which showed the ground truth: package
  installed, zero imports across `xrpl-service/src` and
  `api-gateway/src`). Currently `/pay`'s `x402` mode wraps the
  ordinary XRP settlement path — see the TODO comment in
  `api-gateway/src/routes/pay.ts` inside the `mode === 'x402'`
  branch around line 162 (`// TODO: Replace stub verification with
  real x402-xrpl verifier`). When real x402 verification is built,
  this package is the intended SDK entry point; leave it installed
  in the interim so the future session doesn't have to re-add it.

## AQS / AQT reward token

Token ID: 0.0.9199123 (testnet) — symbol AQT, name "AcquisTest"
Confirmed via mirror node 2026-06-30: decimals=2, supply_type=INFINITE, type=FUNGIBLE_COMMON
Smallest unit: 0.01 AQT. Integer amounts passed to mintTokens/transferToken are hundredths of AQT
(e.g., integer 100 = 1.00 AQT).

## AQS reward calculation

### The formula
AQS reward = floor(transactionAmountCents * rateBps / 10000)

Rate is in basis points (bps). 100 bps = 1%. Allows merchant rates as precise as 0.01%
(1 bps) without floating-point rate values.
Implemented in: `api-gateway/src/utils/calculateReward.ts`

### Default rate
100 bps (1%) — matches the locked business model used in investor materials, YC application,
and grant applications. Applied when no merchant config row exists and ACQUIS_REWARD_RATE_BPS
is not set.

### Merchant configurability
`MerchantConfig` model in `api-gateway/prisma/schema.prisma` — `rewardRateBps` field,
default 100. `getMerchantRewardRateBps(prisma, merchantId = 'default')` in `fund.ts` looks
up the config row. merchantId = 'default' is the platform-wide fallback row.
Per-merchant rates require FundingRequest to carry a merchantId field — that field does not
exist yet. FundingRequest gaining merchantId is the prerequisite for full per-merchant rate
support. MerchantConfig is the first merchant configuration model in the codebase.

### Zero-guard
`calculateReward()` returns `isZero: true` when the computed reward floors to zero.
The webhook handler in `fund.ts` skips the transfer entirely in this case rather than
sending amount=0 to Hedera (which the SDK rejects). Sub-unit rewards are logged, not errored.

### What does NOT change
- TransferService and mintTokens — untouched
- Token decimal precision (2) — fixed, cannot be changed post-creation
- pay.ts lines 19-91 — untouched
- @noble/hashes resolution — untouched
- SmartNode gateway — untouched
- credential-service aqs_balance_delta — separate mechanism for direct NFT metadata updates,
  not transaction-triggered rewards; do not conflate

## Merchant Rule Schema v1.1

Design-complete as of 2026-07-02. Enforcement engine not yet built — blocked on SmartNode/Hooks
decision pending HSuite call (Tom) and attorney consultation.

### What this is
A rule schema defines what a merchant's enforcement configuration looks like as a data structure.
Every transaction is validated against this schema before funds move — the pre-transaction
enforcement layer described in Claims 23–26. Implementation-agnostic: works whether enforcement
runs on HSuite SmartNode (current target), Hedera Hooks (HIP-1195, under evaluation), or any
future validator.

### Core design principles
1. **Rules compile to a topic.** Each merchant's rule set is compiled to a single HCS topic —
   immutable, timestamped, auditable. The topic ID is on-ledger proof that rules were in force.
2. **Rules are versioned.** New version written to HCS on every change. Old versions never deleted.
3. **Rules are additive.** A transaction must pass ALL rules. Any single rule returning false blocks it.
4. **Rules map to patent claims.** Each rule group maps to its claim set (annotated below).
5. **rateBps is the single source of truth for AQS minting.** `MerchantRuleSet.rewards.earnRate.rateBps`
   feeds directly into `calculateReward()` as the `rateBps` parameter — not a parallel calculation.

### Storage architecture decision (2026-07-02)
Add a **separate `MerchantRuleSet` model** (stores compiled JSON + hcsTopicId + version),
NOT an extension of `MerchantConfig`. Rationale: keeps reward-rate config (frequently read,
simple scalar) separate from full rule set (written once per version, read at validation time).
Mirrors HCS topic versioning model.

`MerchantConfig` (already built) covers `rewardRateBps` only.
`MerchantRuleSet` (not yet built) stores the full compiled rule set.

### Build status
```
ALREADY BUILT:
✓ calculateReward(amountCents, rateBps) — api-gateway/src/utils/calculateReward.ts
✓ MerchantConfig model — api-gateway/prisma/schema.prisma (rewardRateBps only)
✓ fund.ts wired to MerchantConfig for rateBps lookup

NOT YET BUILT:
○ MerchantRuleSet model (JSON storage + hcsTopicId)
○ Enforcement engine — validates transaction against MerchantRuleSet, returns RuleValidationResult
○ Merchant config API endpoints
○ Wiring rateBps from stored MerchantRuleSet into calculateReward() in fund.ts

BLOCKED:
⏳ SmartNode bootstrap URL — Tom at HSuite
⏳ SmartNode vs. Hedera Hooks (HIP-1195) — attorney consultation
```

### How rateBps and bonusMultiplier compose
`calculateReward()` is never modified. `bonusMultiplier` is applied after it:
```typescript
const base = calculateReward({ amountCents, rateBps: rules.rewards.earnRate.rateBps });
const finalUnits = Math.floor(base.rewardUnits * rules.rewards.earnRate.bonusMultiplier);
```

### TypeScript interfaces

```typescript
// ─────────────────────────────────────────────
// ACQUIS MERCHANT RULE SCHEMA v1.1
// Maps to USPTO provisional patent claims 23–56
// ─────────────────────────────────────────────

export interface MerchantRuleSet {
  // Identity
  merchantId:    string;
  merchantName:  string;
  hcsTopicId:    string;
  version:       number;
  effectiveAt:   string;       // ISO 8601
  createdAt:     string;       // ISO 8601
  tier:          MerchantTier;

  settlement:    SettlementConfig;
  limits:        TransactionLimits;  // Claims 23–26
  categories:    CategoryRules;      // Claims 23–26
  fraud:         FraudControls;      // Claims 23–26
  rewards:       RewardsConfig;      // Claims 27–31 (A), 39–43 (B)
  funding:       FundingRules;       // Claims 35–38
  agentPolicy?:  AgentPolicy;        // Claims 44–49
  fallback:      FallbackPolicy;
}

export type MerchantTier = 'starter' | 'growth' | 'professional';
// starter      → $199/mo  — core limits + rewards
// growth       → $799/mo  — + category rules + fraud controls
// professional → $1,499/mo — + agent policy + network rewards

export interface SettlementConfig {
  preferredRail:    'xrpl' | 'hedera';
  settlementAsset:  'xrp' | 'rlusd' | 'hbar' | 'hts';
  custodialAddress: string;
  payoutSchedule:   'instant' | 'daily' | 'weekly';
}

// Claims 23–26: Pre-transaction spend enforcement
export interface TransactionLimits {
  perTransaction: { maxAmountCents: number; minAmountCents: number };
  daily:          { maxAmountCents: number; maxTransactions: number };
  monthly:        { maxAmountCents: number; maxTransactions: number };
  perCustomer: {
    dailyMaxCents: number; weeklyMaxCents: number;
    monthlyMaxCents: number; maxTransactionsPerDay: number;
  };
  velocity: { windowMinutes: number; maxAmountCents: number; maxTransactions: number };
}

// Claims 23–26: Category-level spend control
export interface CategoryRules {
  allowedCategories: MerchantCategory[];
  blockedCategories: MerchantCategory[];
  categoryLimits: {
    [category in MerchantCategory]?: { dailyMaxCents: number; perTransactionMax: number };
  };
}

export type MerchantCategory =
  | 'food_beverage' | 'retail' | 'health_wellness' | 'home_services'
  | 'professional_services' | 'entertainment' | 'travel' | 'fuel'
  | 'utilities' | 'other';

// Claims 23–26: Fraud controls
export interface FraudControls {
  duplicateWindow:      { enabled: boolean; windowSeconds: number };
  blockedCustomers:     string[];
  highValueThreshold:   { enabled: boolean; amountCents: number; requireConfirm: boolean };
  operatingHours: {
    enabled: boolean; timezone: string;
    openTime: string; closeTime: string;
    blockedDays: ('monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday')[];
  };
}

// Claims 27–31 (Model A) and 39–43 (Model B)
export interface RewardsConfig {
  model: 'A' | 'B' | 'none';
  earnRate: {
    rateBps:         number;   // Basis points. Default: 100. Passed to calculateReward().
    setBy:           'platform_default' | 'merchant_configured';
    updatedAt?:      string;
    bonusMultiplier: number;   // Applied AFTER calculateReward() — never inside it
  };
  redemption: {
    minBalanceToRedeem:  number;  // Token units (100 = 1.00 AQT)
    maxRedemptionPerTx:  number;
    redemptionRateCents: number;  // AQS → cents (default: 1)
  };
  networkMembership?: {
    enrolledAt:              string;
    networkId:               string;
    crossMerchantFeePercent: number;  // Claims 39–43
  };
}

// Claims 35–38: RTP/FedNow standing approval
export interface FundingRules {
  standingApproval: {
    enabled: boolean; maxAmountCents: number;
    periodMaxCents: number; periodHours: number;
    requiresInvoiceMatch: boolean;
  };
  autoRefund:    { enabled: boolean; thresholdCents: number };
  preferredRail: 'rtp' | 'fedwire' | 'ach' | 'stripe';
}

// Claims 44–49: AI agent bounded spending
export interface AgentPolicy {
  enabled:     boolean;
  principalId: string;
  bounds: {
    maxPerTransactionCents: number; maxDailySpendCents: number;
    maxMonthlySpendCents: number; allowedCategories: MerchantCategory[];
    allowedMerchantIds: string[]; expiresAt: string;
  };
  attribution: {
    recordOnHCS: boolean;
    agentFramework: 'mcp' | 'langchain' | 'crewai' | 'other';
    agentId: string;
  };
  x402: {
    enabled: boolean;
    supportedAssets: ('xrp' | 'rlusd')[];
    maxPaymentAgeCents: number;
  };
}

// Cross-chain enforcement relay
export interface FallbackPolicy {
  settlementCascade:   SettlementOption[];
  railTimeoutSeconds:  number;
  onAllRailsFailed:    'reject' | 'queue' | 'notify_merchant';
}

export interface SettlementOption {
  rail:      'xrpl' | 'hedera' | 'fedwire' | 'ach';
  asset:     'xrp' | 'rlusd' | 'hbar' | 'usd';
  priority:  number;
  conditions?: { maxAmountCents?: number; minAmountCents?: number; requiredAsset?: string };
}

// Claims 54–56: Contractor / 1099 disbursement
export interface ContractorPolicy {
  contractorId:       string;
  maxPerPaymentCents: number;
  annualCapCents:     number;
  ytdPaidCents:       number;
  requiresW9:         boolean;
  flagAt1099:         boolean;
}

// Returned by SmartNode / Hooks enforcement layer
export interface RuleValidationResult {
  approved:       boolean;
  merchantId:     string;
  ruleSetVersion: number;
  hcsTopicId:     string;
  evaluatedAt:    string;
  failedRules:    FailedRule[];
  warnings:       string[];
  onChainProof?: { hcsSequenceNumber: number; hcsConsensusTimestamp: string };
}

export interface FailedRule {
  ruleGroup:   keyof MerchantRuleSet;
  field:       string;
  reason:      string;
  actualValue: number | string;
  limitValue:  number | string;
}
```

### Starter-tier example
```typescript
const exampleRuleSet: MerchantRuleSet = {
  merchantId: 'ACQ-DFW-001', merchantName: 'Classic Coffee',
  hcsTopicId: '0.0.1234567', version: 1,
  effectiveAt: '2026-06-18T00:00:00Z', createdAt: '2026-06-18T00:00:00Z',
  tier: 'starter',
  settlement: { preferredRail: 'xrpl', settlementAsset: 'xrp',
    custodialAddress: 'rU2gCTb79SLxAaGPQkc5RYcAwzfhr4yLLq', payoutSchedule: 'daily' },
  limits: {
    perTransaction: { maxAmountCents: 50000, minAmountCents: 50 },
    daily: { maxAmountCents: 500000, maxTransactions: 200 },
    monthly: { maxAmountCents: 10000000, maxTransactions: 4000 },
    perCustomer: { dailyMaxCents: 20000, weeklyMaxCents: 75000,
      monthlyMaxCents: 200000, maxTransactionsPerDay: 10 },
    velocity: { windowMinutes: 15, maxAmountCents: 30000, maxTransactions: 5 },
  },
  categories: { allowedCategories: ['food_beverage'], blockedCategories: [],
    categoryLimits: { food_beverage: { dailyMaxCents: 500000, perTransactionMax: 5000 } } },
  fraud: {
    duplicateWindow: { enabled: true, windowSeconds: 30 }, blockedCustomers: [],
    highValueThreshold: { enabled: true, amountCents: 10000, requireConfirm: false },
    operatingHours: { enabled: true, timezone: 'America/Chicago',
      openTime: '06:00', closeTime: '21:00', blockedDays: [] },
  },
  rewards: { model: 'A',
    earnRate: { rateBps: 100, setBy: 'platform_default', bonusMultiplier: 1.0 },
    redemption: { minBalanceToRedeem: 500, maxRedemptionPerTx: 1000, redemptionRateCents: 1 } },
  funding: { standingApproval: { enabled: true, maxAmountCents: 5000,
    periodMaxCents: 50000, periodHours: 24, requiresInvoiceMatch: true },
    autoRefund: { enabled: false, thresholdCents: 0 }, preferredRail: 'rtp' },
  fallback: { settlementCascade: [
    { rail: 'xrpl', asset: 'xrp', priority: 1 },
    { rail: 'hedera', asset: 'hbar', priority: 2 },
  ], railTimeoutSeconds: 10, onAllRailsFailed: 'reject' },
};
```

## Component 6: funding-service
Handles customer card funding via push payments (RfP) and ACH fallback.

Architecture rules:
- ALL bank interactions go through a BankAdapter interface. Never call a
  specific bank API directly from business logic.
- Implement MockBankAdapter first (simulates RfP lifecycle + webhooks).
  CrossRiverAdapter and others come later — design the interface so they
  drop in without changes to the state machine.
- RfP is an RTP-network capability today. FedNow RfP is future. ACH pull
  (with NACHA authorization record) is the fallback rail.
- A push payment can ONLY be originated by the customer's bank on the
  customer's instruction. We send Requests for Payment; we never originate
  the push. Standing approvals live at the customer's bank — we store the
  mandate reference and never send RfPs outside its limits.
- Every funding event records to HCS via hedera-service: invoice validation,
  consent state, request sent, credit matched. (Patent Claims 35–38 flow.)
- RfP lifecycle state machine: created → validated → sent → presented →
  approved | declined | expired → settled → matched → credited.
  All transitions idempotent. Unmatched credits go to a reconciliation queue.
