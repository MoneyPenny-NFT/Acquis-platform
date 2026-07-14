// XRPL passive-payment watcher. Subscribes to a merchant's XRPL account via
// WebSocket, matches incoming payments to enrolled AcquisCustomers, and
// credits AQS rewards automatically via the existing creditWebhookReward
// helper — no POS integration required for merchants.
//
// Idempotency: DetectedTransaction.unique(chain, txHash). On WS reconnect,
// backfill is driven from `WatchedMerchantAccount.lastProcessedTimestampOrLedger`
// via account_tx.
//
// This module is designed to be:
//   - startable/stoppable from the api-gateway plugin (single-process MVP)
//   - unit-testable by injecting a fake XrplLike client
//   - safe against duplicate emissions across restart windows

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { creditWebhookReward } from '../routes/webhooks';
import type { FastifyInstance } from 'fastify';

export interface XrplSubscribeMessage {
  transaction?: {
    TransactionType?: string;
    Account?:         string;
    Destination?:     string;
    Amount?:          string | { value: string; currency: string };
    hash?:            string;
  };
  meta?: {
    TransactionResult?: string;
    delivered_amount?:  string | { value: string; currency: string };
  };
  ledger_index?: number;
  validated?:    boolean;
  type?:         string; // 'transaction' for subscription messages
}

// Minimal shape we need from xrpl.js Client — makes the watcher easy to
// mock without importing the actual library in tests.
export interface XrplLike {
  connect():    Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  request<T = unknown>(req: unknown): Promise<T>;
  on(event: 'transaction' | 'disconnected' | 'ledgerClosed', handler: (msg: XrplSubscribeMessage) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface XrplWatcherDeps {
  prisma:      PrismaClient;
  log:         FastifyBaseLogger;
  clientFactory: () => XrplLike;
  merchantId:  string;
  address:     string;
  // Injected so tests can drive credit + backfill without a real prisma
  onMatchedPayment?: (params: {
    merchantId:  string;
    senderAddress: string;
    txHash:      string;
    amount:      string;
    currency:    string;
    customerAcquisId: string;
  }) => Promise<string | null>;
  // Reconnect backoff bounds (ms)
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
}

export class XrplWatcher {
  private client: XrplLike | null = null;
  private stopping = false;
  private reconnectMs: number;
  private readonly reconnectMinMs: number;
  private readonly reconnectMaxMs: number;

  constructor(private readonly deps: XrplWatcherDeps) {
    this.reconnectMinMs = deps.reconnectMinMs ?? 1000;
    this.reconnectMaxMs = deps.reconnectMaxMs ?? 30000;
    this.reconnectMs    = this.reconnectMinMs;
  }

  async start(): Promise<void> {
    this.stopping = false;
    await this.connectAndSubscribe();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.client?.isConnected()) {
      await this.client.disconnect();
    }
  }

  private async connectAndSubscribe(): Promise<void> {
    try {
      this.client = this.deps.clientFactory();
      await this.client.connect();

      // Backfill anything we missed since the last high-water mark, BEFORE
      // subscribing so we don't race against live events.
      await this.backfill();

      // Subscribe to the merchant account
      await this.client.request({
        command:  'subscribe',
        accounts: [this.deps.address],
      });

      this.client.on('transaction', (msg) => {
        this.handleTransaction(msg).catch(err => this.deps.log.error({ err }, 'xrplWatcher.handleTransaction failed'));
      });
      this.client.on('disconnected', () => {
        if (this.stopping) return;
        this.deps.log.warn('xrplWatcher WS disconnected — scheduling reconnect');
        this.scheduleReconnect();
      });

      // Reset backoff on successful connect
      this.reconnectMs = this.reconnectMinMs;
      this.deps.log.info({ address: this.deps.address }, 'xrplWatcher connected + subscribed');
    } catch (err) {
      this.deps.log.error({ err }, 'xrplWatcher connect failed');
      if (!this.stopping) this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    setTimeout(() => { if (!this.stopping) this.connectAndSubscribe(); }, this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, this.reconnectMaxMs);
  }

  // Pull unprocessed transactions since last high-water mark. XRPL's
  // account_tx supports pagination via `marker`. We iterate until we've
  // covered up to the current ledger.
  private async backfill(): Promise<void> {
    if (!this.client) return;
    const record = await this.deps.prisma.watchedMerchantAccount.findUnique({
      where: {
        merchantId_chain_address: {
          merchantId: this.deps.merchantId,
          chain:      'xrpl',
          address:    this.deps.address,
        },
      },
    });
    const minLedger = record?.lastProcessedTimestampOrLedger
      ? parseInt(record.lastProcessedTimestampOrLedger, 10) + 1
      : -1; // -1 = "from earliest"

    let marker: unknown = undefined;
    let processed = 0;
    do {
      const req: Record<string, unknown> = {
        command:      'account_tx',
        account:      this.deps.address,
        ledger_index_min: minLedger,
        ledger_index_max: -1,
        limit:        50,
        forward:      true,
      };
      if (marker) req.marker = marker;
      const res = await this.client.request<{ result: { transactions: Array<{ tx: XrplSubscribeMessage['transaction']; meta: XrplSubscribeMessage['meta']; validated: boolean; ledger_index: number }>; marker?: unknown } }>(req);
      for (const t of res.result.transactions ?? []) {
        if (!t.validated) continue;
        await this.handleTransaction({
          transaction:  t.tx,
          meta:         t.meta,
          ledger_index: t.ledger_index,
          validated:    true,
        });
        processed++;
      }
      marker = res.result.marker;
    } while (marker);
    if (processed > 0) this.deps.log.info({ processed }, 'xrplWatcher backfill complete');
  }

  private async handleTransaction(msg: XrplSubscribeMessage): Promise<void> {
    const tx = msg.transaction;
    if (!tx?.hash || tx.TransactionType !== 'Payment') return;
    if (tx.Destination !== this.deps.address) return; // Only incoming
    if (msg.meta && typeof msg.meta === 'object' && msg.meta.TransactionResult !== 'tesSUCCESS') return;

    const senderAddress = tx.Account!;
    const txHash        = tx.hash;
    const delivered     = msg.meta?.delivered_amount ?? tx.Amount;
    const amount        = typeof delivered === 'string' ? delivered : (delivered?.value ?? '0');
    const currency      = typeof delivered === 'string' ? 'XRP' : (delivered?.currency ?? 'XRP');

    // Idempotency: try to insert; unique(chain, txHash) will throw on duplicate.
    let dt;
    try {
      dt = await this.deps.prisma.detectedTransaction.create({
        data: {
          chain:            'xrpl',
          txHash,
          senderAddress,
          recipientAddress: tx.Destination!,
          amount,
          currency,
          status:           'pending', // will update below
        },
      });
    } catch {
      // Duplicate — already processed by a prior emission
      return;
    }

    // Match sender to an AcquisCustomer via xrplAddress
    const customer = await this.deps.prisma.acquisCustomer.findUnique({
      where: { xrplAddress: senderAddress },
    });

    if (!customer) {
      await this.deps.prisma.detectedTransaction.update({
        where: { id: dt.id },
        data:  { status: 'customer_not_found' },
      });
      this.deps.log.info({ txHash, senderAddress }, 'xrplWatcher unmatched sender — logged for backstop');
      await this.updateHighWaterMark(msg.ledger_index);
      return;
    }

    // Credit reward via the injected callback (or fall back to no-op in tests)
    try {
      const rewardEventId = this.deps.onMatchedPayment
        ? await this.deps.onMatchedPayment({
            merchantId:      this.deps.merchantId,
            senderAddress,
            txHash,
            amount,
            currency,
            customerAcquisId: customer.acquisId,
          })
        : null;
      await this.deps.prisma.detectedTransaction.update({
        where: { id: dt.id },
        data:  { status: 'matched', matchedCustomerAcquisId: customer.acquisId, rewardEventId },
      });
      this.deps.log.info({ txHash, customerAcquisId: customer.acquisId, rewardEventId }, 'xrplWatcher credited reward');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.prisma.detectedTransaction.update({
        where: { id: dt.id },
        data:  { status: 'error', matchedCustomerAcquisId: customer.acquisId, errorMessage: message },
      });
      this.deps.log.error({ err, txHash }, 'xrplWatcher credit failed');
    }

    await this.updateHighWaterMark(msg.ledger_index);
  }

  private async updateHighWaterMark(ledgerIndex: number | undefined): Promise<void> {
    if (!ledgerIndex) return;
    await this.deps.prisma.watchedMerchantAccount.upsert({
      where: {
        merchantId_chain_address: {
          merchantId: this.deps.merchantId,
          chain:      'xrpl',
          address:    this.deps.address,
        },
      },
      update: {
        lastProcessedTimestampOrLedger: String(ledgerIndex),
        lastMatchedTransactionAt:       new Date(),
      },
      create: {
        merchantId: this.deps.merchantId,
        chain:      'xrpl',
        address:    this.deps.address,
        lastProcessedTimestampOrLedger: String(ledgerIndex),
        active:     true,
      },
    });
  }
}

// Bridge from the watcher back into the existing reward-credit helper so a
// matched payment writes an AQS RewardEvent + HCS record + updates the
// customer's aqsBalance, all under the same idempotency guarantees as
// /rewards/credit and /webhooks/pos.
export function makeOnMatchedPayment(app: FastifyInstance) {
  return async (params: {
    merchantId:  string;
    senderAddress: string;
    txHash:      string;
    amount:      string;
    currency:    string;
    customerAcquisId: string;
  }): Promise<string | null> => {
    // XRPL amount for XRP is in drops (1e6). Convert to cents using the
    // configured rate. For non-XRP currencies, no auto-credit (needs new logic).
    if (params.currency !== 'XRP') {
      app.log.warn({ txHash: params.txHash, currency: params.currency }, 'xrplWatcher: non-XRP payment currency — reward credit skipped');
      return null;
    }
    const drops = parseInt(params.amount, 10);
    const xrp   = drops / 1_000_000;
    const rate  = parseFloat(process.env.XRPL_XRP_USD_RATE ?? '2.50');
    const amountCents = Math.round(xrp * rate * 100);
    if (amountCents <= 0) return null;

    return creditWebhookReward(app, {
      merchantId:   params.merchantId,
      customerId:   params.customerAcquisId,
      amountCents,
      externalRef:  `xrpl_${params.txHash}`,
      source:       'xrpl_watcher',
    });
  };
}
