import { httpGet, httpPost } from './http';
import { ConfigError, PaymentError } from './errors';
import type {
  AcquisConfig, AccountInfo, TokenInfo, TransferResult,
  PaymentRequest, PaymentResult,
} from './types';

export class AcquisClient {
  private readonly base: string;

  constructor(private readonly config: AcquisConfig) {
    if (!config.apiBaseUrl) throw new ConfigError('apiBaseUrl is required');
    if (!config.treasuryAccountId) throw new ConfigError('treasuryAccountId is required');
    if (!config.treasuryKey) throw new ConfigError('treasuryKey is required');
    this.base = config.apiBaseUrl.replace(/\/+$/, '') + '/api/v1';
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async createAccount(initialHbar = 10): Promise<AccountInfo> {
    return httpPost<AccountInfo>(`${this.base}/accounts`, { initialHbar });
  }

  async getAccount(accountId: string): Promise<AccountInfo> {
    return httpGet<AccountInfo>(`${this.base}/accounts/${encodeURIComponent(accountId)}`);
  }

  // ── Tokens ────────────────────────────────────────────────────────────────

  async createToken(params: {
    name: string; symbol: string; decimals: number;
    initialSupply: number; maxSupply?: number;
  }): Promise<TokenInfo> {
    return httpPost<TokenInfo>(`${this.base}/tokens`, {
      ...params,
      treasuryAccountId: this.config.treasuryAccountId,
      treasuryKey: this.config.treasuryKey,
    });
  }

  async mintTokens(tokenId: string, amount: number): Promise<{ minted: number; status: string }> {
    return httpPost(`${this.base}/tokens/${encodeURIComponent(tokenId)}/mint`, {
      supplyKey: this.config.treasuryKey,
      amount,
    });
  }

  async burnTokens(tokenId: string, amount: number): Promise<{ burned: number; status: string }> {
    return httpPost(`${this.base}/tokens/${encodeURIComponent(tokenId)}/burn`, {
      supplyKey: this.config.treasuryKey,
      amount,
    });
  }

  async associateToken(tokenId: string, accountId: string, accountKey: string): Promise<void> {
    return httpPost(`${this.base}/tokens/${encodeURIComponent(tokenId)}/associate`, {
      accountId,
      accountKey,
    });
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async pay(request: PaymentRequest): Promise<PaymentResult> {
    const mode = request.mode ?? 'token';

    try {
      if (mode === 'hbar') {
        const transfer = await httpPost<TransferResult>(`${this.base}/transfers/hbar`, {
          fromId: this.config.treasuryAccountId,
          fromKey: this.config.treasuryKey,
          toId: request.toAccountId,
          amount: request.amount,
        });
        return { success: true, transfer };
      }

      const tokenId = request.tokenId ?? this.config.tokenId;
      if (!tokenId) throw new ConfigError('tokenId is required for token payments');

      const transfer = await httpPost<TransferResult>(`${this.base}/transfers/token`, {
        tokenId,
        fromId: this.config.treasuryAccountId,
        fromKey: this.config.treasuryKey,
        toId: request.toAccountId,
        amount: request.amount,
      });
      return { success: true, transfer };

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      throw new PaymentError(message);
    }
  }

  // ── Convenience ───────────────────────────────────────────────────────────

  /** pay() wrapped in try/catch — returns PaymentResult without throwing */
  async tryPay(request: PaymentRequest): Promise<PaymentResult> {
    try {
      return await this.pay(request);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
