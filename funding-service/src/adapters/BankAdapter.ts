// BankAdapter — the ONLY way business logic touches a bank.
// All bank-specific logic lives in an adapter implementation.
// CrossRiverAdapter, ModernTreasuryAdapter, etc. implement this interface;
// the state machine never changes.

export interface RfPRequest {
  idempotencyKey: string;
  hederaAccountId: string;
  amountCents: number;
  currency: string;
  mandateRef: string;       // standing-approval mandate ref at customer's bank
  description?: string;
  expiresAt: Date;
}

export interface RfPResult {
  providerRef: string;      // bank's opaque reference for this RfP
  submittedAt: Date;
}

export interface AchPullRequest {
  idempotencyKey: string;
  hederaAccountId: string;
  routingNumber: string;
  accountNumber: string;    // full number — never persisted; passed through to bank only
  amountCents: number;
  authType: 'PPD' | 'CCD' | 'WEB';
  authDate: Date;
  description?: string;
}

export interface AchPullResult {
  providerRef: string;
  estimatedSettlement: Date;
}

// Normalised webhook event types — every adapter maps its raw payload to these.
export type WebhookEventType =
  | 'rfp.presented'    // bank has presented the RfP to the customer
  | 'rfp.approved'     // customer approved the RfP at their bank
  | 'rfp.declined'     // customer declined
  | 'rfp.expired'      // RfP expired at the bank without action
  | 'credit.received'  // funds pushed into our settlement account (RTP/FedNow)
  | 'ach.settled'      // ACH pull settled
  | 'ach.returned';    // ACH pull returned (R-code)

export interface NormalizedWebhookEvent {
  type: WebhookEventType;
  providerRef: string;      // matches FundingRequest.providerRef or is a new credit ref
  amountCents?: number;
  currency?: string;
  reason?: string;          // decline reason / ACH return code
  timestamp: Date;
  raw: unknown;             // original payload for audit
}

export interface BankAdapter {
  // Submit a Request for Payment. Returns the bank's reference.
  // Business logic MUST NOT call any bank API directly.
  sendRfP(request: RfPRequest): Promise<RfPResult>;

  // Cancel a previously submitted RfP (no-op if already presented/acted on).
  cancelRfP(providerRef: string): Promise<void>;

  // Initiate an ACH pull (fallback rail). authType per NACHA rules.
  initiateAchPull(authorization: AchPullRequest): Promise<AchPullResult>;

  // Return true if the webhook payload was signed by the bank.
  // Called before parseWebhookEvent — reject if false.
  verifyWebhookSignature(payload: Buffer, headers: Record<string, string>): boolean;

  // Parse the raw webhook body into a normalised event.
  parseWebhookEvent(payload: Buffer): NormalizedWebhookEvent;
}
