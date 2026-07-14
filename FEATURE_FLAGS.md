# Feature Flags Inventory

Every environment-variable-gated feature flag in the Acquis monorepo.
Compiled 2026-07-13 by grepping the codebase (not from memory of past
discussions). Update this file when a new flag is added, removed, or
its dependencies change.

Read this before flipping any flag. Several are no-ops on real traffic
until other work ships; a few appear in `.env.example` but are not
consumed by any code path.

---

## Summary

Actually gates code (seven flags):

- `CREDENTIAL_VERIFICATION_ENABLED` — fully wired end-to-end after slot 2 landed 2026-07-13
- `KYC_ENFORCEMENT_ENABLED` — fully wired; blocked on attorney CIP documentation (customer KYC)
- `MERCHANT_AGREEMENT_ENABLED` — fully wired; blocked on attorney review of merchant services agreement text (merchant KYB, separate)
- `STRIPE_CONNECT_ENABLED` — fully wired; blocked on provisioning STRIPE_SECRET_KEY test-mode credentials
- `QR_ENROLLMENT_ENABLED` — fully wired; blocked on attorney review of wallet-linkage consent text (services/enrollmentConsent.ts)
- `ENFORCEMENT_ENGINE_ENABLED` — fully wired end-to-end; when true, `/pay` runs Merchant Rule Schema v1.1 validation before any settlement. Adapter today is a stub (`api-gateway/src/enforcement/stubAdapter.ts`); the pure-function engine (`@acquis/enforcement-engine`) is backend-agnostic — SmartNode / Hedera Hooks / native smart contract can each swap in later without touching pay.ts or the rule schema. Requires a MerchantRuleSet row for each merchant; if none exists, requests 503 with `reason: no_rule_set`.
- `VITE_ADMIN_MODE` — client-side UI visibility only; backend enforces its own auth

Documented in comments or UI but not enforced by any code (one ghost remaining):

- `OFFERS_SENDING_ENABLED` — referenced only in comments and a UI status label. There is no `process.env.OFFERS_SENDING_ENABLED` check anywhere. The underlying "sends" infrastructure (email/SMS delivery, audience, campaigns) does not exist yet. The flag is aspirational, not enforced. See section 5 below and the clean-slate audit note.

Previously listed as a ghost, now deleted from `.env.example` (2026-07-13):
- `NFT_METADATA_UPDATES_ENABLED` — was in `api-gateway/.env.example` line 16; removed because it implied control that did not exist and wiring a partial off-switch would have introduced NFT/DB state divergence risk. See section 6.

---

## 1. CREDENTIAL_VERIFICATION_ENABLED

**Flag name:** `CREDENTIAL_VERIFICATION_ENABLED`

**Location in code:** `api-gateway/src/routes/pay.ts:22`

**Current value:**
- `api-gateway/.env.example`: `false` (documented default)
- `api-gateway/.env`: unset
- `api-gateway/.env.local`: unset

**Default behavior if unset:** Fail open. The credential pre-check block does not execute. Every payment mode (token, hbar, xrp, x402) proceeds to settlement without verifying an XRPL credential on the customer's address.

**What it actually gates:** The block at `pay.ts:20-31` — a call to `verifyCredential({ accountAddress: customerXrplAddress })` from `@acquis/xrpl-service` (real testnet call as of 2026-07-13 credential-stubs work). If the check runs and returns `valid: false`, the request is rejected with 403.

**TRUE ACTIVATION CONDITIONS:**

Flipping the flag now genuinely enforces — client wiring landed 2026-07-13. The guard is `if (process.env.CREDENTIAL_VERIFICATION_ENABLED === 'true' && customerXrplAddress)`. Both parts:
- Flag: on when `CREDENTIAL_VERIFICATION_ENABLED=true` is set in `api-gateway/.env.local`.
- Address: `pos-terminal/src/pages/Cart.tsx` now has an optional XRPL address input; `pos-terminal/src/api/client.ts` `pay()`, `payXrp()`, `payX402()` all accept and forward `customerXrplAddress`.
- Second env dependency: `XRPL_CREDENTIAL_ISSUER_ADDRESS` must also be set — if missing, `verifyCredential()` returns `{valid:false}` unconditionally (fail-closed inside the service) even though the request contained an address. Live proof this session hit this misconfiguration first; documenting so the next operator doesn't.

**Behavior matrix (all four confirmed live on testnet 2026-07-13):**
- Flag off, address absent → check skipped, payment proceeds
- Flag on, address absent → check skipped (backward-compat), payment proceeds
- Flag on, address present, credential valid on XRPL → check runs, 200
- Flag on, address present, credential invalid/missing → check runs, 403 with "Account does not hold a valid Acquis membership credential"

**What breaks or silently no-ops if flipped without setting `XRPL_CREDENTIAL_ISSUER_ADDRESS`:** As of 2026-07-13, the failure modes are distinguishable end-to-end:
- Server misconfigured (no issuer address) → HTTP **503** with `reason: "issuer_not_configured"`. Operator-actionable.
- Server configured, credential missing/invalid on ledger → HTTP **403** with `reason: "not_found"`. User-actionable (customer needs to enroll or re-issue).

The `reason` field is set by `verifyCredential()` in xrpl-service and echoed by the api-gateway's /pay handler. Distinguishing was added specifically so a misconfigured prod env doesn't look identical to legitimate revocation for every customer in triage logs.

**Sign-off required before flipping to true in production:**
- Engineering: XRPL_CREDENTIAL_ISSUER_ADDRESS and XRPL_CREDENTIAL_ISSUER_SEED provisioned in production env.
- Product: decision on merchant UX — should the address input on Cart be required for xrp/x402 modes, or stay optional (current)?
- No legal sign-off required — this is technical enforcement of an already-agreed data model.
- Note: once QR enrollment (slot 3) ships, the AcquisCustomer record will carry the XRPL address, and the client can auto-populate the field from the wallet-lookup flow rather than requiring merchant input.

---

## 2. KYC_ENFORCEMENT_ENABLED

**Flag name:** `KYC_ENFORCEMENT_ENABLED`

**Location in code:** `api-gateway/src/routes/onboarding.ts:4` (`kycEnabled()` helper), consumed at lines 39, 46, 54, 62, 70, 78, 86 (every route in the onboarding routes group).

**Current value:**
- `api-gateway/.env.example`: `false` (documented default)
- `api-gateway/.env`: unset
- `api-gateway/.env.local`: unset

**Default behavior if unset:** Fail closed. Every `/api/v1/onboarding/*` endpoint returns HTTP 501 with body `"KYC onboarding is not yet enabled. Set KYC_ENFORCEMENT_ENABLED=true once attorney CIP documentation is complete."` No proxy call is made to the onboarding-service.

**What it actually gates:** The proxy to onboarding-service (`http://localhost:3003` by default) for the full KYC flow: IDV start/complete, bank-link start/complete, and consent submission. When on, every request in the family is forwarded verbatim.

**TRUE ACTIVATION CONDITIONS:**

Flipping the env var will start proxying requests to onboarding-service. Onboarding-service must be running (per project memory: `cd onboarding-service && npm run dev`, port 3003). No client-side code change required — the POS and dashboard don't currently drive an onboarding flow; onboarding is triggered by API consumers (test scripts, future customer signup web flow).

There is no client-side dependency on this flag. It is a real, single-toggle activation for the endpoints.

**What breaks or silently no-ops if flipped without other prep:**
- If onboarding-service is not running, requests fail with a fetch error (503-ish behavior; the current code doesn't catch this so a 500 propagates).
- If Plaid credentials are not configured in onboarding-service, the IDV/bank-link flow errors mid-session.
- The consent write path calls HCS (real writes) — flipping this to `true` in production causes real testnet HCS traffic per onboarding session.

**Sign-off required before flipping to true in production:**
- **Attorney: CIP (Customer Identification Program) documentation must be complete.** The placeholder message names this explicitly. This is the primary gate.
- Compliance: FinCEN MSB obligations for onboarding data retention verified.
- Engineering: onboarding-service deployed and healthy; Plaid production credentials in the service's env; HCS topic for consent writes correct.

---

## 3. VITE_ADMIN_MODE

**Flag name:** `VITE_ADMIN_MODE`

**Location in code:** `merchant-dashboard/src/App.tsx:16`, `merchant-dashboard/src/components/Sidebar.tsx:4`

**Current value:**
- `merchant-dashboard/.env.example`: `false` (documented default)
- `merchant-dashboard/.env`: unset
- `merchant-dashboard/.env.local`: unset

**Default behavior if unset:** Fail closed (client-side). The dashboard routes `/accounts`, `/tokens`, `/transfers` redirect to `/`. The sidebar hides the "Hedera" nav section. The header label reads "Merchant" instead of "Admin".

**What it actually gates:** Purely UI visibility on the merchant-dashboard frontend. The backend still enforces its own auth via `x-api-key` and merchant-scoped routes. Turning this on does NOT elevate any user's actual permissions — anyone who bypasses the redirect (e.g. by editing the Vite bundle or hitting the routes with a matching URL) still needs a valid API key for the underlying calls.

**TRUE ACTIVATION CONDITIONS:**

Flipping the env var alone is sufficient to change UI visibility. Requires a Vite dev server restart or rebuild (Vite bakes env into the bundle at start; hot reload doesn't reliably pick up `.env.local` changes).

**What breaks or silently no-ops if flipped without other prep:** Nothing. Admin views (`Accounts`, `Tokens`, `Transfers`) will render. They call the same api-gateway routes as before and will error appropriately if the API key lacks whatever the endpoint requires.

**Sign-off required before flipping to true in production:**
- None for security — the flag is not a security boundary. It's a "show/hide" toggle for engineering-focused pages that most merchants don't need.
- Product: decision on which merchant tier or role sees admin UI. If admin views are for internal Acquis staff only, this flag should live on a separate internal-only dashboard build, not in the merchant-facing dashboard.

---

## 4. MERCHANT_AGREEMENT_ENABLED

**Flag name:** `MERCHANT_AGREEMENT_ENABLED`

**Location in code:** `api-gateway/src/routes/merchants.ts` in the `POST /merchants/:merchantId/agreement/sign` handler.

**Current value:**
- `api-gateway/.env.example`: `false` (documented default)
- `api-gateway/.env` / `.env.local`: unset

**Default behavior if unset:** Fail closed. The endpoint returns HTTP 501 with message `"Merchant agreement acceptance is not yet enabled. Set MERCHANT_AGREEMENT_ENABLED=true once attorney review of the agreement text is complete."` No HCS write, no DB update.

**What it actually gates:** The full merchant agreement signing path — SHA-256 hashing of the agreement text, HCS write of `{type:'merchant.agreement.signed', merchantId, agreementHash, signedByName, signedAt, ...}`, and update of the Merchant row's agreement fields (`agreementHash`, `agreementSignedAt`, `agreementSignedBy`, `hcsAgreementTopicId`, `hcsAgreementSeqNumber`, `hcsAgreementTxId`, status transition from `pending` → `agreement_signed`).

**TRUE ACTIVATION CONDITIONS:**

Flipping the env var alone is sufficient — the endpoint is fully wired end-to-end and was proven on real testnet 2026-07-13 (HCS seq 24 on topic 0.0.9342744). But do NOT flip in production without:

1. **Attorney-approved agreement text** — the substance of what merchants are agreeing to. Same shape as customer consent text.
2. Merchant onboarding UI to actually present the text and capture assent (currently no UI; only the raw API endpoint exists).
3. Business decision on what agreement text hashing means legally (SHA-256(text) on-chain is a strong integrity signal, but "click to accept" workflow is separate from the audit trail).

**What breaks or silently no-ops if flipped without prep:** Nothing silent. If flipped, the endpoint accepts any agreementText and writes it to HCS on the real testnet topic. On mainnet, this means real agreement records get written to a live consensus log with (possibly) incorrect legal text. That IS a problem — but it's a "the record is real, but the substance is wrong" problem, not a "the flag did nothing" problem.

**Sign-off required before flipping to true in production:**
- **Attorney: merchant services agreement text draft review.** Primary gate.
- Product: merchant onboarding UI shipped.
- Optional: BSA officer review of merchant agreement AML/KYB terms.

---

## 5. STRIPE_CONNECT_ENABLED

**Flag name:** `STRIPE_CONNECT_ENABLED`

**Location in code:** `api-gateway/src/routes/stripeConnect.ts` — gates all three endpoints (`POST /merchants/:id/stripe-connect/create`, `POST /merchants/:id/stripe-connect/link`, `GET /merchants/:id/stripe-connect/status`).

**Current value:**
- `api-gateway/.env.example`: `false` (documented default)
- `api-gateway/.env` / `.env.local`: unset

**Default behavior if unset:** Fail closed. All three endpoints return HTTP 501 with message naming both the flag AND the STRIPE_SECRET_KEY prerequisite.

**What it actually gates:** The Stripe Connect Custom integration for merchant KYB delegation. When on, `/create` builds a Stripe Custom Connected Account with the merchant's legalName and metadata, `/link` returns a Stripe-hosted onboarding URL, `/status` refreshes charges_enabled/payouts_enabled from Stripe onto the local Merchant row.

**TRUE ACTIVATION CONDITIONS:**

Flipping the env var alone is NOT sufficient. Also required:

1. `STRIPE_SECRET_KEY` — a Stripe secret key (test-mode `sk_test_...` for development, live `sk_live_...` for production). Per project memory, this is not currently provisioned in the .env.local.
2. Stripe Connect must be enabled in the Stripe dashboard account settings (typically requires an application review by Stripe before Live mode).
3. Merchant onboarding UI to trigger the /create → /link → /status flow (currently API-only).
4. Return-URL / refresh-URL endpoints on the merchant-dashboard that Stripe redirects to after onboarding completes.

**What breaks or silently no-ops if flipped without STRIPE_SECRET_KEY:** The endpoints will 500 when they try to instantiate Stripe (the SDK constructor throws `STRIPE_SECRET_KEY must be set`). Not silent — the failure is loud — but the error is at the individual request level, not at flag-flip time.

**Sign-off required before flipping to true in production:**
- Engineering: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` provisioned.
- Stripe: Connect application approved (Stripe reviews your platform terms before enabling Live mode).
- Product: merchant onboarding UI + return-URL endpoints shipped.
- Legal: platform-vs-merchant liability terms understood (Stripe Custom means Acquis is a Payment Facilitator — has real compliance obligations beyond a Standard Stripe integration).

---

## 6. QR_ENROLLMENT_ENABLED

**Flag name:** `QR_ENROLLMENT_ENABLED`

**Location in code:** `api-gateway/src/routes/enrollment.ts` — gates all four enrollment endpoints (`POST /enrollment/qr/session`, `GET /enrollment/qr/session/:id`, `POST /enrollment/qr/session/:id/complete`, `POST /enrollment/qr/session/:id/cancel`).

**Current value:**
- `api-gateway/.env.example`: `false` (documented default)
- `api-gateway/.env` / `.env.local`: unset

**Default behavior if unset:** Fail closed. All four endpoints return HTTP 501 with message naming the attorney-review prerequisite. `GET /enrollment/consent-text` (which returns the consent version + hash + text) is NOT gated — clients can always fetch and display the text; enrollment mechanically cannot happen without the flag.

**What it actually gates:** The QR-scan enrollment path — session creation (Xumm SignIn payload, 90-second single-use QR expiry), session polling, wallet-callback completion (captures XRPL address → creates or updates `AcquisCustomer` row with `xrplAddress` → mints AcquisMember credential to that address via `xrpl-service.createCredential` → writes `qr_enrollment.consent` message to HCS with the current consent text hash), and cancel.

**TRUE ACTIVATION CONDITIONS:**

Flipping the env var alone is sufficient once the consent text has attorney sign-off. The endpoint infrastructure is fully wired; the Xumm SDK falls back to deterministic stubs when `XUMM_API_KEY` / `XUMM_API_SECRET` are unset (real Xaman scan flow requires those). For a live pilot demo, both the Xumm creds AND attorney sign-off matter.

**What breaks or silently no-ops if flipped without XUMM creds:** The `/session` endpoint returns a stub `qrPng` URL that doesn't resolve to a real Xaman scannable QR. The `xummConfigured: false` field in the response makes this observable. Complete flow still works if a caller directly POSTs `/complete` with an XRPL address — useful for demos and integration tests but not production. Not silent.

**What breaks or silently no-ops if flipped WITHOUT attorney-reviewed consent text:** The endpoint accepts scans and records `consentTextHash` referencing the DRAFT constant in `services/enrollmentConsent.ts` line 1. On mainnet, HCS would carry a permanent audit record referencing "DRAFT v0 pending attorney review" — same failure mode as MERCHANT_AGREEMENT_ENABLED without agreement text approval.

**Sign-off required before flipping to true in production:**
- **Attorney: wallet-linkage consent text review.** The text explicitly says "your wallet address will be permanently associated in Acquis's systems with any contact information you have already provided." This is stronger disclosure than the existing marketing/rewards consent covers.
- Engineering: `XUMM_API_KEY` + `XUMM_API_SECRET` provisioned in api-gateway/.env.local (for real Xaman QR flow — stub is fine for internal demos).
- Engineering: XRPL_CREDENTIAL_ISSUER_ADDRESS + SEED provisioned (already required by CREDENTIAL_VERIFICATION_ENABLED; enrollment shares the same issuer).
- Note: an XRPL owner reserve impact was empirically confirmed on testnet 2026-07-13 — each CredentialCreate increments the ISSUER's OwnerCount by 1, not the subject's. See `api-gateway/src/routes/enrollment.ts` comment. This means Acquis's operational XRP reserve requirement grows linearly with active enrollments (approximately 2 XRP per credential at current mainnet reserve levels). Confirm reserve provisioning before scaling.

---

## 7. NFT_METADATA_UPDATES_ENABLED — REMOVED 2026-07-13

**Historical note.** Previously appeared in `api-gateway/.env.example:16` as `NFT_METADATA_UPDATES_ENABLED=true`. Grep confirmed zero references in source — the flag was a ghost that implied operator control over NFT metadata writes without any actual guard code.

**Resolution:** Line removed from `.env.example` (not wired). Rationale for delete-not-wire: NFT metadata updates in enrollment.service.ts are called from suspension and rebalance flows. A partial off-switch would leave the on-chain NFT desynced from the DB record for suspended or rebalanced customers, introducing a state-divergence surface with no legitimate operational reason to want it. Cleaner to eliminate the misleading signal than to add a footgun.

**If a future need arises to actually gate NFT metadata writes** (e.g. cost control during a demo, or an outage in hedera-service), wire the guard around the specific caller in `credential-service/src/services/enrollment.service.ts` (the `NFTService.updateNFTMetadata` calls in `updateMetadata` and `suspend`), and document the DB/chain divergence tradeoff in this file at that time.

---

## 5. OFFERS_SENDING_ENABLED (referenced in comments only, not enforced)

**Flag name:** `OFFERS_SENDING_ENABLED`

**Location in code:**
- Comment: `api-gateway/src/routes/rewards.ts:349` ("No sends are triggered — OFFERS_SENDING_ENABLED is disabled platform-wide.")
- UI status label: `merchant-dashboard/src/pages/rewards/Customers.tsx:359` ("No communications are sent at this time (OFFERS_SENDING_ENABLED=false).")

**Current value:**
- Not present in any `.env`, `.env.local`, or `.env.example` file.
- Not read by `process.env.OFFERS_SENDING_ENABLED` anywhere.

**Default behavior if unset:** N/A — no code path consumes the flag.

**What it actually gates:** Nothing. There is no email/SMS/push send infrastructure in the codebase yet. The rewards.ts comment is describing what SHOULD be true when send infrastructure is added; the UI label is telling merchants that offer-sending is disabled, which is truthful (because it doesn't exist), but not because of a flag check.

**TRUE ACTIVATION CONDITIONS:** Setting this flag does nothing today. Before this flag becomes meaningful:
1. A send provider (SES, Twilio, etc.) must be integrated.
2. A send worker or endpoint that consumes marketing consent must be built.
3. Guard code (`if (process.env.OFFERS_SENDING_ENABLED === 'true') { ... }`) must be added around every send site.
4. Then, and only then, does the env var change behavior.

**What breaks or silently no-ops if flipped:** Nothing changes. This is the most dangerous of the "documented but inert" flags — because the UI actively tells merchants offer-sending is disabled, a future engineer might assume the plumbing exists and just flip the flag. It doesn't.

**Sign-off required before flipping to true in production:**
- **Attorney: TCPA (SMS) and CAN-SPAM (email) review of consent text**. Marketing consent language currently in the AcquisCustomer model was drafted for future compliance but has not been legally reviewed.
- Attorney: state-by-state consent requirements (California CCPA, etc.).
- Engineering: entire send pipeline (see 1-4 above) must exist first.

---

## Related items that are NOT feature flags but worth knowing

These affect production readiness but are not env-var-gated flags:

**Webhook secret encryption at rest.** `MerchantConfig.webhookSecret` in `api-gateway/prisma/schema.prisma` is currently a plaintext `String?`. Plan (from project build queue): replace with `webhookSecretCiphertext / webhookSecretIv / webhookSecretTag` using the same AES-256-GCM pattern as Plaid tokens (`api-gateway/src/lib/crypto.ts`). No env var gates this — it's a schema+code migration that should ship together with merchant onboarding's write path. Do NOT seed plaintext webhook secrets once that migration lands.

**SmartNode initialization.** `api-gateway/src/plugins/smartnode.ts` gracefully degrades when `XRPL_MERCHANT_SEED` is unset or when `BaasClient.connectToCluster` fails. No explicit feature flag — the degrade is implicit. Payments via SmartNode-validated flows will show `smartnodeValidated: false` when the gateway is not ready. Currently the SmartNode is not initialized on dev (known blocker: HSuite bootstrap DNS).

**DATABASE_URL points at `/tmp/acquis.db`.** macOS wipes `/tmp` on reboot. Not a feature flag — a data-location config. Deferred; see build queue.

---

## Verification tips for future engineers

- To confirm a flag is actually consumed: `grep -rn "process\.env\.THE_FLAG" src/` — if zero hits outside comments and `.env.example`, the flag is inert.
- To confirm a client-side flag is baked into the bundle: Vite loads `.env.local` on top of `.env` at build/dev-server start; changes are NOT hot-reloaded reliably. Restart Vite.
- To confirm an api-gateway flag change is live: api-gateway reads env at boot in the plugin/route registration phase. Restart the node process (`node dist/index.js`) after changing `.env.local`.
- To spot new ghost flags (documented in `.env.example` but not consumed): after adding a line to any `.env.example`, add the corresponding `process.env.X` check in code, or don't add the line.
