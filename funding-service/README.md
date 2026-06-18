# funding-service

Handles customer card funding via push payments (Request for Payment / RfP)
and ACH pull as a fallback rail. Part of the Acquis BaaS platform on Hedera
Hashgraph (patent pending, 56 claims).

---

## Architecture

### The BankAdapter contract

**All bank interactions go through the `BankAdapter` interface** defined in
`src/adapters/BankAdapter.ts`. Business logic — the state machine, reconciliation
jobs, Hedera writes — never calls a bank API directly.

```
┌─────────────────────┐     ┌──────────────────────┐
│   FundingService    │────▶│   BankAdapter         │
│   (state machine)   │     │   (interface)         │
└─────────────────────┘     ├──────────────────────┤
                             │ MockBankAdapter (now) │
                             │ CrossRiverAdapter     │
                             │ ModernTreasuryAdapter │
                             └──────────────────────┘
```

To add a new bank adapter:

1. Create `src/adapters/YourBankAdapter.ts` implementing `BankAdapter`:
   ```typescript
   import type { BankAdapter, RfPRequest, RfPResult, ... } from './BankAdapter';

   export class YourBankAdapter implements BankAdapter {
     async sendRfP(request: RfPRequest): Promise<RfPResult> { ... }
     async cancelRfP(providerRef: string): Promise<void> { ... }
     async initiateAchPull(authorization: AchPullRequest): Promise<AchPullResult> { ... }
     verifyWebhookSignature(payload: Buffer, headers: Record<string, string>): boolean { ... }
     parseWebhookEvent(payload: Buffer): NormalizedWebhookEvent { ... }
   }
   ```

2. Normalise your bank's raw webhook payload to `NormalizedWebhookEvent` in
   `parseWebhookEvent`. All seven event types must be covered:

   | Our type          | Description                                     |
   |-------------------|-------------------------------------------------|
   | `rfp.presented`   | RfP shown to the customer at their bank         |
   | `rfp.approved`    | Customer approved the RfP                       |
   | `rfp.declined`    | Customer declined (or mandate invalid)          |
   | `rfp.expired`     | RfP expired without action                      |
   | `credit.received` | Funds pushed into our settlement account (RTP)  |
   | `ach.settled`     | ACH pull settled                                |
   | `ach.returned`    | ACH pull returned (R-code in `reason` field)    |

3. Set `BANK_ADAPTER=your-bank` in `.env` and wire it in `src/app.ts`.

**No changes to `FundingService`, the state machine, or any other file are
needed when swapping adapters.** This is the core design invariant.

---

## RfP state machine

```
created ──► validated ──► sent ──► presented ──► approved ──► settled ──► matched ──► credited
                                       │
                                       ├──► declined  (terminal)
                                       └──► expired   (terminal)
```

Banks may skip `presented` and send `declined` or `expired` directly from
`sent` (e.g. immediate mandate rejection). All transitions are **idempotent**:
re-delivering a webhook event for the current state is a silent no-op.
Conflicting branch transitions (e.g. `rfp.approved` after `rfp.declined`)
throw `StateMachineError`.

---

## Standing approvals

A `StandingApproval` represents a customer's pre-authorisation stored **at their
bank**. We store only the opaque `mandateRef` — we never originate push payments;
we only send Requests for Payment within the mandate's limits.

Limits enforced before any RfP is created:
- `perTxLimitCents` — single transaction cap
- `periodLimitCents` — rolling period sum (excludes declined/expired requests)
- `expiresAt` — hard expiry date of the mandate

---

## Hedera integration (Patent Claims 35–38)

Every significant funding event is written to HCS via `hedera-service`:

| Claim | Event            | When                                 |
|-------|------------------|--------------------------------------|
| 35    | invoice.validated | Before sending any RfP              |
| 37    | rfp.sent         | After bank acknowledges submission   |
| 38    | credit.matched   | After InboundCredit linked to RfP   |

The `HederaClient` interface in `src/clients/HederaClient.ts` is currently
backed by `StubHederaClient` (no-op). Replace with `HttpHederaClient` once
`hedera-service` exposes these endpoints:

```
POST /api/v1/funding/validate-invoice
POST /api/v1/hcs/write
POST /api/v1/accounts/:id/credit
```

---

## Reconciliation jobs (Bull)

Three recurring Bull jobs run against the database:

| Job              | Default schedule | Purpose                                   |
|------------------|------------------|-------------------------------------------|
| `expire-rfps`    | `*/5 * * * *`    | Expire in-flight RfPs past `expiresAt`    |
| `sweep-unmatched`| `*/10 * * * *`   | Move unmatched credits > 1 h to review   |
| `retry-hcs`      | `*/2 * * * *`    | Retry failed HCS writes (network errors)  |

Redis is required for Bull. Set `REDIS_URL` in `.env`. Jobs are disabled (warning logged) when Redis is unavailable — useful for local dev without Redis.

---

## API endpoints

All endpoints require `x-api-key` header except `/api/v1/health` and
`/api/v1/webhook`.

```
GET  /api/v1/health

POST /api/v1/standing-approvals
GET  /api/v1/standing-approvals?hederaAccountId=0.0.XXXXX
DEL  /api/v1/standing-approvals/:id

POST /api/v1/rfp
GET  /api/v1/rfp/:id

POST /api/v1/ach-authorizations

POST /api/v1/webhook    (raw body; verified by BankAdapter.verifyWebhookSignature)
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in:

```
PORT=3002
API_KEYS=your-api-key
DATABASE_URL=file:/tmp/funding-service.db
REDIS_URL=redis://localhost:6379
HEDERA_SERVICE_URL=http://localhost:3001
HEDERA_SERVICE_API_KEY=internal-key
BANK_ADAPTER=mock
```

---

## Running

```bash
npm install
npm run db:push        # initialise SQLite (dev)
npm run dev            # tsx watch mode
npm test               # 32 tests, 6 suites
npm run typecheck      # tsc --noEmit
```
