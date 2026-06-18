import type {
  BankAdapter,
  RfPRequest,
  RfPResult,
  AchPullRequest,
  AchPullResult,
  NormalizedWebhookEvent,
  WebhookEventType,
} from './BankAdapter';

export type MockScenario = 'happy' | 'decline' | 'expire' | 'unmatched_credit';

// Injected by the funding service so webhooks are processed inline.
export type WebhookHandler = (event: NormalizedWebhookEvent) => Promise<void>;

/**
 * MockBankAdapter — in-memory simulation of the bank rail.
 *
 * Usage in production code:  adapter = new MockBankAdapter();
 * Usage in tests:            adapter.setWebhookHandler(fn); adapter.fireWebhook(event);
 *
 * Auto-fire mode (BANK_ADAPTER=mock at runtime):
 *   Set adapter.scenario before calling sendRfP.  The adapter schedules
 *   the appropriate webhook sequence via setTimeout.
 *
 * Manual mode (tests):
 *   Call adapter.fireWebhook(...) directly for deterministic control.
 */
export class MockBankAdapter implements BankAdapter {
  public scenario: MockScenario = 'happy';
  public presentedDelayMs = 500;
  public approvedDelayMs  = 1000;
  public creditDelayMs    = 1500;

  private webhookHandler: WebhookHandler | null = null;
  private counter = 0;

  setWebhookHandler(handler: WebhookHandler): void {
    this.webhookHandler = handler;
  }

  async sendRfP(request: RfPRequest): Promise<RfPResult> {
    const providerRef = `mock-rfp-${request.idempotencyKey}-${++this.counter}`;

    if (this.webhookHandler && this.scenario !== 'unmatched_credit') {
      this.scheduleWebhooks(providerRef, request);
    }

    return { providerRef, submittedAt: new Date() };
  }

  async cancelRfP(_providerRef: string): Promise<void> {
    // no-op — mock doesn't maintain pending RfP state externally
  }

  async initiateAchPull(authorization: AchPullRequest): Promise<AchPullResult> {
    return {
      providerRef: `mock-ach-${authorization.idempotencyKey}`,
      estimatedSettlement: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    };
  }

  verifyWebhookSignature(_payload: Buffer, _headers: Record<string, string>): boolean {
    return true;
  }

  parseWebhookEvent(payload: Buffer): NormalizedWebhookEvent {
    return JSON.parse(payload.toString('utf8')) as NormalizedWebhookEvent;
  }

  // ─── Test helpers ───────────────────────────────────────────────────────────

  /** Fire a webhook event directly — full control for tests. */
  async fireWebhook(event: NormalizedWebhookEvent): Promise<void> {
    if (!this.webhookHandler) throw new Error('No webhook handler registered');
    await this.webhookHandler(event);
  }

  /** Convenience: fire a typed event for a given providerRef. */
  async fireEvent(
    type: WebhookEventType,
    providerRef: string,
    amountCents?: number,
    extra?: Partial<NormalizedWebhookEvent>,
  ): Promise<void> {
    await this.fireWebhook({
      type,
      providerRef,
      amountCents,
      timestamp: new Date(),
      raw: { mock: true },
      ...extra,
    });
  }

  /** Emit an unmatched credit that has no corresponding RfP. */
  async fireUnmatchedCredit(amountCents: number): Promise<void> {
    await this.fireEvent(
      'credit.received',
      `mock-orphan-credit-${Date.now()}`,
      amountCents,
    );
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private scheduleWebhooks(providerRef: string, request: RfPRequest): void {
    // Auto-fire is for dev/demo mode only. Errors are suppressed so that
    // late-arriving timers don't crash after a request reaches a terminal state.
    const fire = async (type: WebhookEventType, extra?: Partial<NormalizedWebhookEvent>) => {
      if (!this.webhookHandler) return;
      try {
        await this.webhookHandler({
          type,
          providerRef,
          amountCents: request.amountCents,
          currency:    request.currency,
          timestamp:   new Date(),
          raw:         { mock: true },
          ...extra,
        });
      } catch {
        // Suppress — terminal-state conflicts from stale timers are expected
      }
    };

    const t = (fn: () => void, ms: number) => setTimeout(fn, ms).unref();

    switch (this.scenario) {
      case 'happy':
        t(() => void fire('rfp.presented'), this.presentedDelayMs);
        t(() => void fire('rfp.approved'),  this.approvedDelayMs);
        t(() => void fire('credit.received', { providerRef: `mock-credit-${providerRef}` }),
          this.creditDelayMs);
        break;

      case 'decline':
        t(() => void fire('rfp.presented'), this.presentedDelayMs);
        t(() => void fire('rfp.declined', { reason: 'Insufficient funds' }), this.approvedDelayMs);
        break;

      case 'expire':
        t(() => void fire('rfp.presented'), this.presentedDelayMs);
        t(() => void fire('rfp.expired'),   this.approvedDelayMs);
        break;
    }
  }
}
