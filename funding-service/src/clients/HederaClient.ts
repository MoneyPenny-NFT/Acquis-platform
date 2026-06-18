// HederaClient — interface for hedera-service calls.
// The funding-service never touches the Hedera SDK directly.
// Stub is the default; replace with HttpHederaClient once
// hedera-service endpoints are finalised.

// TODO: replace stub host with HEDERA_SERVICE_URL when live
// Expected hedera-service endpoints (to be implemented there):
//   POST /api/v1/funding/validate-invoice   { fundingRequestId, hederaAccountId, amountCents }
//   POST /api/v1/hcs/write                  { type, fundingRequestId, ...payload }
//   POST /api/v1/accounts/:id/credit        { amountCents, fundingRequestId }

export interface InvoiceValidationRequest {
  fundingRequestId: string;
  hederaAccountId: string;
  amountCents: number;
}

export interface InvoiceValidationResult {
  valid: boolean;
  topicId: string;    // HCS topic ID where validation was recorded
  messageId: string;
}

export interface HcsWriteRequest {
  type:
    | 'rfp.sent'
    | 'consent.captured'
    | 'credit.matched';
  fundingRequestId: string;
  [key: string]: unknown;
}

export interface HcsWriteResult {
  messageId: string;
  topicId: string;
  consensusTimestamp: string;
}

export interface CreditBalanceRequest {
  hederaAccountId: string;
  amountCents: number;
  fundingRequestId: string;
}

export interface HederaClient {
  // Patent Claim 35 — invoice validation before sending any RfP
  validateInvoice(req: InvoiceValidationRequest): Promise<InvoiceValidationResult>;

  // Patent Claims 36–38 — HCS writes at: consent, request sent, credit matched
  writeHcs(req: HcsWriteRequest): Promise<HcsWriteResult>;

  // Credit the customer's card balance after a matched, settled credit
  creditBalance(req: CreditBalanceRequest): Promise<void>;
}

// ─── Stub implementation ──────────────────────────────────────────────────────
// Used until hedera-service /funding and /hcs endpoints are ready.
// All methods succeed silently and return placeholder IDs.

export class StubHederaClient implements HederaClient {
  async validateInvoice(
    _req: InvoiceValidationRequest,
  ): Promise<InvoiceValidationResult> {
    // TODO: POST ${HEDERA_SERVICE_URL}/api/v1/funding/validate-invoice
    return {
      valid: true,
      topicId: 'stub-topic-0.0.1234',
      messageId: `stub-validate-${Date.now()}`,
    };
  }

  async writeHcs(_req: HcsWriteRequest): Promise<HcsWriteResult> {
    // TODO: POST ${HEDERA_SERVICE_URL}/api/v1/hcs/write
    return {
      messageId: `stub-hcs-${Date.now()}`,
      topicId: 'stub-topic-0.0.1234',
      consensusTimestamp: new Date().toISOString(),
    };
  }

  async creditBalance(_req: CreditBalanceRequest): Promise<void> {
    // TODO: POST ${HEDERA_SERVICE_URL}/api/v1/accounts/${req.hederaAccountId}/credit
  }
}
