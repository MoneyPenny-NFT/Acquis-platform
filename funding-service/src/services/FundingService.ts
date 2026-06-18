import type { PrismaClient, FundingRequest, StandingApproval, InboundCredit } from '@prisma/client';
import type { BankAdapter, NormalizedWebhookEvent } from '../adapters/BankAdapter';
import type { HederaClient } from '../clients/HederaClient';
import { assertTransition, type RfpState } from '../state/RfpStateMachine';

export interface CreateRfPParams {
  idempotencyKey: string;
  hederaAccountId: string;
  amountCents: number;
  standingApprovalId: string;
  currency?: string;
  /** Defaults to now + 24 h */
  expiresAt?: Date;
}

export interface CreateStandingApprovalParams {
  hederaAccountId: string;
  mandateRef: string;
  perTxLimitCents: number;
  periodLimitCents: number;
  periodDays?: number;
  expiresAt: Date;
}

export interface CreateAchAuthParams {
  hederaAccountId: string;
  routingNumber: string;
  accountNumber: string;    // passed to bank, NOT persisted
  accountNumberMask: string;
  authType: 'PPD' | 'CCD' | 'WEB';
  authDate: Date;
}

export class FundingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FundingValidationError';
  }
}

export class FundingService {
  constructor(
    private readonly db: PrismaClient,
    private readonly bank: BankAdapter,
    private readonly hedera: HederaClient,
  ) {}

  // ─── Standing approvals ───────────────────────────────────────────────────

  async createStandingApproval(params: CreateStandingApprovalParams): Promise<StandingApproval> {
    return this.db.standingApproval.create({
      data: {
        hederaAccountId: params.hederaAccountId,
        mandateRef:       params.mandateRef,
        perTxLimitCents:  params.perTxLimitCents,
        periodLimitCents: params.periodLimitCents,
        periodDays:       params.periodDays ?? 30,
        expiresAt:        params.expiresAt,
        status:           'active',
      },
    });
  }

  async getStandingApprovals(hederaAccountId: string): Promise<StandingApproval[]> {
    return this.db.standingApproval.findMany({
      where: { hederaAccountId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeStandingApproval(id: string): Promise<StandingApproval> {
    return this.db.standingApproval.update({
      where: { id },
      data: { status: 'revoked' },
    });
  }

  // ─── ACH authorizations ───────────────────────────────────────────────────

  async createAchAuthorization(params: CreateAchAuthParams) {
    // Initiate with bank (passes full account number through — never persisted here)
    const result = await this.bank.initiateAchPull({
      idempotencyKey:  `ach-auth-${params.hederaAccountId}-${Date.now()}`,
      hederaAccountId: params.hederaAccountId,
      routingNumber:   params.routingNumber,
      accountNumber:   params.accountNumber,
      amountCents:     0,  // authorization only, amount set per-pull
      authType:        params.authType,
      authDate:        params.authDate,
    });

    return this.db.achAuthorization.create({
      data: {
        hederaAccountId:   params.hederaAccountId,
        routingNumber:     params.routingNumber,
        accountNumberMask: params.accountNumberMask,
        authType:          params.authType,
        authDate:          params.authDate,
        providerRef:       result.providerRef,
        status:            'active',
      },
    });
  }

  // ─── Funding requests (RfP lifecycle) ─────────────────────────────────────

  async createRfP(params: CreateRfPParams): Promise<FundingRequest> {
    // Idempotency: return existing if key already processed
    const existing = await this.db.fundingRequest.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    // 1. Validate standing approval
    await this.validateStandingApproval(params.standingApprovalId, params.amountCents);

    // 2. Create in 'created' state
    const expiresAt = params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
    let req = await this.db.fundingRequest.create({
      data: {
        idempotencyKey:    params.idempotencyKey,
        hederaAccountId:   params.hederaAccountId,
        amountCents:       params.amountCents,
        currency:          params.currency ?? 'USD',
        state:             'created',
        standingApprovalId: params.standingApprovalId,
        expiresAt,
      },
    });

    // 3. Invoice validation via hedera-service (Patent Claim 35)
    const invoice = await this.hedera.validateInvoice({
      fundingRequestId: req.id,
      hederaAccountId:  params.hederaAccountId,
      amountCents:      params.amountCents,
    });
    req = await this.transition(req.id, 'validated', {
      hcsInvoiceTopicId: invoice.topicId,
    });

    // 4. Send RfP to bank
    const approval = await this.db.standingApproval.findUniqueOrThrow({
      where: { id: params.standingApprovalId },
    });
    const rfpResult = await this.bank.sendRfP({
      idempotencyKey:  params.idempotencyKey,
      hederaAccountId: params.hederaAccountId,
      amountCents:     params.amountCents,
      currency:        params.currency ?? 'USD',
      mandateRef:      approval.mandateRef,
      expiresAt,
    });
    req = await this.transition(req.id, 'sent', { providerRef: rfpResult.providerRef });

    // 5. HCS write: rfp.sent (Patent Claim 37)
    const hcsMsg = await this.hedera.writeHcs({
      type:             'rfp.sent',
      fundingRequestId: req.id,
      providerRef:      rfpResult.providerRef,
    });
    req = await this.db.fundingRequest.update({
      where: { id: req.id },
      data:  { hcsRequestMsgId: hcsMsg.messageId },
    });

    return req;
  }

  async getFundingRequest(id: string): Promise<FundingRequest | null> {
    return this.db.fundingRequest.findUnique({ where: { id } });
  }

  // ─── Webhook processing ───────────────────────────────────────────────────

  async handleWebhookEvent(event: NormalizedWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'rfp.presented':
        return this.onRfpPresented(event);
      case 'rfp.approved':
        return this.onRfpApproved(event);
      case 'rfp.declined':
        return this.onRfpDeclined(event);
      case 'rfp.expired':
        return this.onRfpExpired(event);
      case 'credit.received':
      case 'ach.settled':
        return this.onCreditReceived(event);
      case 'ach.returned':
        return this.onAchReturned(event);
    }
  }

  // ─── Reconciliation operations (called by Bull jobs) ──────────────────────

  /** Expire all FundingRequests past their deadline that are still in-flight. */
  async expireStaleRfPs(): Promise<number> {
    const stale = await this.db.fundingRequest.findMany({
      where: {
        state:     { in: ['sent', 'presented'] },
        expiresAt: { lte: new Date() },
      },
    });

    for (const req of stale) {
      await this.transition(req.id, 'expired', { expiredAt: new Date() });
    }
    return stale.length;
  }

  /** Move unmatched credits older than 1 hour to the review queue. */
  async sweepUnmatchedCredits(): Promise<number> {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const unmatched = await this.db.inboundCredit.findMany({
      where: { status: 'unmatched', receivedAt: { lte: cutoff } },
    });

    for (const credit of unmatched) {
      await this.db.inboundCredit.update({
        where: { id: credit.id },
        data:  { status: 'reviewed', reviewedAt: new Date() },
      });
    }
    return unmatched.length;
  }

  /** Retry HCS writes that failed on first attempt. */
  async retryFailedHcsWrites(): Promise<number> {
    const pending = await this.db.fundingRequest.findMany({
      where: { hcsPendingWrite: { not: null } },
    });

    let retried = 0;
    for (const req of pending) {
      try {
        const payload = JSON.parse(req.hcsPendingWrite!) as { type: 'rfp.sent' | 'consent.captured' | 'credit.matched'; [k: string]: unknown };
        const { type: hcsType, ...rest } = payload;
        const result = await this.hedera.writeHcs({
          type: hcsType,
          fundingRequestId: req.id,
          ...rest,
        });
        await this.db.fundingRequest.update({
          where: { id: req.id },
          data:  {
            hcsPendingWrite: null,
            hcsRequestMsgId: result.messageId,
          },
        });
        retried++;
      } catch {
        // Leave hcsPendingWrite set; will retry next tick
      }
    }
    return retried;
  }

  // ─── Private webhook handlers ─────────────────────────────────────────────

  private async onRfpPresented(event: NormalizedWebhookEvent): Promise<void> {
    const req = await this.findByProviderRef(event.providerRef);
    if (!req) return;
    await this.transition(req.id, 'presented', { presentedAt: event.timestamp });
  }

  private async onRfpApproved(event: NormalizedWebhookEvent): Promise<void> {
    const req = await this.findByProviderRef(event.providerRef);
    if (!req) return;
    await this.transition(req.id, 'approved', { approvedAt: event.timestamp });
  }

  private async onRfpDeclined(event: NormalizedWebhookEvent): Promise<void> {
    const req = await this.findByProviderRef(event.providerRef);
    if (!req) return;
    await this.transition(req.id, 'declined', {
      declinedAt:    event.timestamp,
      declineReason: event.reason ?? null,
    });
  }

  private async onRfpExpired(event: NormalizedWebhookEvent): Promise<void> {
    const req = await this.findByProviderRef(event.providerRef);
    if (!req) return;
    await this.transition(req.id, 'expired', { expiredAt: event.timestamp });
  }

  private async onCreditReceived(event: NormalizedWebhookEvent): Promise<void> {
    // Idempotency: ignore if already processed
    const existing = await this.db.inboundCredit.findUnique({
      where: { providerRef: event.providerRef },
    });
    if (existing) return;

    const credit = await this.db.inboundCredit.create({
      data: {
        providerRef: event.providerRef,
        amountCents: event.amountCents ?? 0,
        currency:    event.currency ?? 'USD',
        status:      'unmatched',
        receivedAt:  event.timestamp,
        rawPayload:  JSON.stringify(event.raw),
      },
    });

    await this.reconcileCredit(credit);
  }

  private async onAchReturned(event: NormalizedWebhookEvent): Promise<void> {
    const auth = await this.db.achAuthorization.findFirst({
      where: { providerRef: event.providerRef },
    });
    if (!auth) return;
    await this.db.achAuthorization.update({
      where: { id: auth.id },
      data:  { status: 'returned' },
    });
  }

  // ─── Credit reconciliation ────────────────────────────────────────────────

  private async reconcileCredit(credit: InboundCredit): Promise<void> {
    // FIFO: match against the oldest approved request with the exact amount
    const matchingReq = await this.db.fundingRequest.findFirst({
      where:   { state: 'approved', amountCents: credit.amountCents },
      orderBy: { createdAt: 'asc' },
    });
    if (!matchingReq) return; // will be swept to review queue after 1 h

    // Link credit → request
    await this.db.inboundCredit.update({
      where: { id: credit.id },
      data:  {
        status:          'matched',
        matchedRequestId: matchingReq.id,
        matchedAt:       new Date(),
      },
    });

    // State machine: approved → settled → matched
    await this.transition(matchingReq.id, 'settled', { settledAt: new Date() });
    await this.transition(matchingReq.id, 'matched', { matchedCreditId: credit.id });

    // HCS write: credit.matched (Patent Claim 38)
    let hcsMsgId: string | undefined;
    try {
      const hcsMsg = await this.hedera.writeHcs({
        type:             'credit.matched',
        fundingRequestId: matchingReq.id,
        creditId:         credit.id,
      });
      hcsMsgId = hcsMsg.messageId;
    } catch {
      // Store for retry — don't block crediting the customer
      await this.db.fundingRequest.update({
        where: { id: matchingReq.id },
        data:  {
          hcsPendingWrite: JSON.stringify({
            type:     'credit.matched',
            creditId: credit.id,
          }),
        },
      });
    }

    // Credit the customer's Hedera balance
    await this.hedera.creditBalance({
      hederaAccountId:  matchingReq.hederaAccountId,
      amountCents:      matchingReq.amountCents,
      fundingRequestId: matchingReq.id,
    });

    // Final transition: matched → credited
    await this.transition(matchingReq.id, 'credited', {
      creditedAt:    new Date(),
      hcsCreditMsgId: hcsMsgId ?? null,
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findByProviderRef(providerRef: string): Promise<FundingRequest | null> {
    return this.db.fundingRequest.findFirst({ where: { providerRef } });
  }

  private async validateStandingApproval(
    standingApprovalId: string,
    amountCents: number,
  ): Promise<void> {
    const approval = await this.db.standingApproval.findUnique({
      where: { id: standingApprovalId },
    });
    if (!approval) {
      throw new FundingValidationError('Standing approval not found');
    }
    if (approval.status !== 'active') {
      throw new FundingValidationError(`Standing approval is ${approval.status}`);
    }
    if (new Date() >= approval.expiresAt) {
      throw new FundingValidationError('Standing approval has expired');
    }
    if (amountCents > approval.perTxLimitCents) {
      throw new FundingValidationError(
        `Amount ${amountCents} cents exceeds per-transaction limit of ${approval.perTxLimitCents} cents`,
      );
    }

    // Period limit: sum of completed + in-flight requests within the period window
    const periodStart = new Date(
      Date.now() - approval.periodDays * 24 * 60 * 60 * 1000,
    );
    const periodTotal = await this.db.fundingRequest.aggregate({
      where: {
        standingApprovalId: standingApprovalId,
        state:              { notIn: ['declined', 'expired'] },
        createdAt:          { gte: periodStart },
      },
      _sum: { amountCents: true },
    });
    const used = periodTotal._sum.amountCents ?? 0;
    if (used + amountCents > approval.periodLimitCents) {
      throw new FundingValidationError(
        `Amount would exceed period limit of ${approval.periodLimitCents} cents ` +
        `(${used} cents already used in the last ${approval.periodDays} days)`,
      );
    }
  }

  private async transition(
    id: string,
    to: RfpState,
    updates: Record<string, unknown> = {},
  ): Promise<FundingRequest> {
    const req = await this.db.fundingRequest.findUniqueOrThrow({ where: { id } });
    const result = assertTransition(req.state as RfpState, to);

    if (result === 'skip') return req;

    return this.db.fundingRequest.update({
      where: { id },
      data:  { state: to, ...updates },
    });
  }
}
