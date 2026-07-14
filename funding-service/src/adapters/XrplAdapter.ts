import type {
  BankAdapter,
  RfPRequest,
  RfPResult,
  AchPullRequest,
  AchPullResult,
  NormalizedWebhookEvent,
} from './BankAdapter';
import { generateDestinationTag } from '@acquis/xrpl-service';

type WebhookHandler = (event: NormalizedWebhookEvent) => Promise<void>;

/**
 * XrplAdapter — BankAdapter implementation over the XRP Ledger.
 *
 * Instead of traditional bank RfPs (Request for Payment), XRPL uses
 * destination tags to route payments. sendRfP() allocates a unique tag
 * as providerRef. The caller is responsible for instructing the customer
 * to send XRP to the merchant address with that tag, then firing the
 * appropriate webhook events once the payment is confirmed on-ledger.
 *
 * In production: subscribe to the merchant's XRPL address via WebSocket
 * and emit credit.received when a matching payment arrives.
 * In testnet demo: api-gateway executes the payment directly and calls
 * notifyPaymentReceived() to fire the events.
 */
export class XrplAdapter implements BankAdapter {
  private webhookHandler: WebhookHandler | null = null;

  setWebhookHandler(handler: WebhookHandler): void {
    this.webhookHandler = handler;
  }

  async sendRfP(_request: RfPRequest): Promise<RfPResult> {
    const destinationTag = generateDestinationTag();
    // providerRef is the destination tag as a string — used to correlate
    // the incoming XRPL payment back to this FundingRequest.
    return {
      providerRef: String(destinationTag),
      submittedAt: new Date(),
    };
  }

  async cancelRfP(_providerRef: string): Promise<void> {
    // Cancel any active WebSocket subscription for this destination tag.
    // No-op in demo mode; in production, unsubscribe from ledger stream.
  }

  async initiateAchPull(_authorization: AchPullRequest): Promise<AchPullResult> {
    throw new Error('ACH pull is not available on the XRPL rail');
  }

  verifyWebhookSignature(_payload: Buffer, _headers: Record<string, string>): boolean {
    // XRPL delivers events via direct WebSocket, not signed webhooks.
    return true;
  }

  parseWebhookEvent(payload: Buffer): NormalizedWebhookEvent {
    return JSON.parse(payload.toString('utf8')) as NormalizedWebhookEvent;
  }

  /**
   * Call this after confirming an XRPL payment on-ledger.
   * Fires rfp.approved → credit.received in sequence.
   */
  async notifyPaymentReceived(
    destinationTag: number,
    amountCents: number,
    txHash: string,
  ): Promise<void> {
    if (!this.webhookHandler) return;
    const providerRef = String(destinationTag);
    const now = new Date();

    await this.webhookHandler({
      type: 'rfp.approved',
      providerRef,
      amountCents,
      currency: 'XRP',
      timestamp: now,
      raw: { txHash },
    });

    await this.webhookHandler({
      type: 'credit.received',
      providerRef,
      amountCents,
      currency: 'XRP',
      timestamp: now,
      raw: { txHash },
    });
  }
}
