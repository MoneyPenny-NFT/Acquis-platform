const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const API_KEY = import.meta.env.VITE_API_KEY ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Rewards types ──────────────────────────────────────────────────────────

export interface RewardSummary {
  merchantId: string;
  issuedToday: number;
  issuedWeek: number;
  issuedMonth: number;
  activeCustomers: number;
  totalOutstanding: number;
}

export interface RewardEvent {
  id: string;
  merchantId: string;
  customerId: string;
  eventType: string;
  amountCents: number | null;
  rewardUnits: number;
  externalRef: string | null;
  hcsSequenceNumber: number | null;
  status: string;
  createdAt: string;
}

export interface RewardEventsResponse {
  merchantId: string;
  total: number;
  limit: number;
  offset: number;
  events: RewardEvent[];
}

export interface CustomerBalance {
  acquisId: string;
  aqsBalance: number;
  balanceDisplay: string;
  kycLevel: string;
  tier: string;
  rewardsConsentGranted: boolean;
  marketingConsentGranted: boolean;
  marketingConsentChannels: string[];
  recentEvents: RewardEvent[];
}

export interface CreditRewardResult {
  rewardUnits: number;
  rewardDisplay: string;
  hcsSequenceNumber: number | null;
  customerBalance: number;
  transactionId: string | null;
  eventId: string;
  customerId: string;
}

export interface CredentialIssueResult {
  acquisId: string;
  phone?: string;
  email?: string;
  kycLevel: string;
  nft?: {
    tokenId: string;
    serialNumber: number;
    txId: string;
  };
  enrolled: boolean;
  existing: boolean;
  hcsSequenceNumber?: number;
}

export interface RedemptionResult {
  redemptionEventId: string;
  code: string;
  redeemUnits: number;
  redeemDisplay: string;
  valueCents: number;
  expiresAt: string;
  hcsSequenceNumber: number | null;
  newBalance: number;
}

export interface RedemptionValidateResult {
  acquisId: string;
  redemptionEventId: string;
  redeemUnits: number;
  redeemDisplay: string;
  valueCents: number;
  validatedAt: string;
  hcsSequenceNumber: number | null;
}

export interface RedemptionEvent {
  id: string;
  acquisId: string;
  merchantId: string;
  redeemUnits: number;
  redeemDisplay: string;
  valueCents: number;
  externalRef: string | null;
  hcsSequenceNumber: number | null;
  hcsTopicId: string | null;
  status: string;
  createdAt: string;
  code?: { status: string; usedAt: string | null; expiresAt: string } | null;
}

export interface RedemptionsResponse {
  acquisId: string;
  total: number;
  limit: number;
  offset: number;
  events: RedemptionEvent[];
}

// ── API client ─────────────────────────────────────────────────────────────

export const api = {
  // ── Accounts ──────────────────────────────────────────────────────────
  createAccount: (initialHbar?: number) =>
    request<{ accountId: string; privateKey: string; publicKey: string }>('/accounts', {
      method: 'POST',
      body: JSON.stringify({ initialHbar }),
    }),
  getAccount: (accountId: string) =>
    request<{ accountId: string }>(`/accounts/${accountId}`),

  // ── Tokens ────────────────────────────────────────────────────────────
  createToken: (body: {
    name: string; symbol: string; decimals: number;
    initialSupply: number; treasuryAccountId: string; treasuryKey: string;
  }) => request<{ tokenId: string; name: string; symbol: string }>('/tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  mintTokens: (tokenId: string, supplyKey: string, amount: number) =>
    request<{ minted: number; status: string }>(`/tokens/${tokenId}/mint`, {
      method: 'POST',
      body: JSON.stringify({ supplyKey, amount }),
    }),
  burnTokens: (tokenId: string, supplyKey: string, amount: number) =>
    request<{ burned: number; status: string }>(`/tokens/${tokenId}/burn`, {
      method: 'POST',
      body: JSON.stringify({ supplyKey, amount }),
    }),
  associateToken: (tokenId: string, accountId: string, accountKey: string) =>
    request<void>(`/tokens/${tokenId}/associate`, {
      method: 'POST',
      body: JSON.stringify({ accountId, accountKey }),
    }),

  // ── Transfers ─────────────────────────────────────────────────────────
  transferHbar: (fromId: string, fromKey: string, toId: string, amount: number) =>
    request<{ fromId: string; toId: string; amount: number; asset: string }>('/transfers/hbar', {
      method: 'POST',
      body: JSON.stringify({ fromId, fromKey, toId, amount }),
    }),
  transferToken: (tokenId: string, fromId: string, fromKey: string, toId: string, amount: number) =>
    request<{ tokenId: string; fromId: string; toId: string; amount: number }>('/transfers/token', {
      method: 'POST',
      body: JSON.stringify({ tokenId, fromId, fromKey, toId, amount }),
    }),

  // ── Rewards ───────────────────────────────────────────────────────────
  getRewardsSummary: (merchantId: string) =>
    request<RewardSummary>(`/merchants/${merchantId}/rewards/summary`),

  getRewardEvents: (merchantId: string, limit = 50, offset = 0) =>
    request<RewardEventsResponse>(
      `/merchants/${merchantId}/rewards/events?limit=${limit}&offset=${offset}`,
    ),

  getCustomerBalance: (customerId: string) =>
    request<CustomerBalance>(`/customers/${customerId}/rewards/balance`),

  creditReward: (body: {
    merchantId: string;
    customerId?: string;
    customerContact?: { phone?: string; email?: string };
    eventType: string;
    amountCents?: number;
    fixedRewardUnits?: number;
    externalRef?: string;
  }) => request<CreditRewardResult>('/rewards/credit', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  // ── Reconciliation ────────────────────────────────────────────────────
  reconcile: (acquisId: string, lookbackDays = 30) =>
    request<{
      acquisId: string; lookbackDays: number; examined: number;
      credited: number; skipped: number; errors: number;
      totalRewardUnits: number; totalRewardDisplay: string;
      unrecoverableCount: number;
      events: Array<{ webhookEventId: string; status: string; amountCents: number | null; rewardUnits?: number }>;
    }>(`/customers/${acquisId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ lookbackDays }),
    }),

  // ── Customer preferences ──────────────────────────────────────────────
  updatePreferences: (acquisId: string, body: { marketingConsent?: boolean; marketingChannels?: string[] }) =>
    request<{ acquisId: string; marketingConsentGranted: boolean; marketingConsentChannels: string[] }>(
      `/customers/${acquisId}/preferences`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  // ── Redemption ────────────────────────────────────────────────────────
  redeem: (body: {
    acquisId: string;
    merchantId: string;
    redeemUnits: number;
    externalRef?: string;
  }) => request<RedemptionResult>('/rewards/redeem', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  validateRedeem: (body: { code: string; merchantId: string }) =>
    request<RedemptionValidateResult>('/rewards/redeem/validate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getRedemptions: (acquisId: string, limit = 50, offset = 0) =>
    request<RedemptionsResponse>(
      `/customers/${acquisId}/redemptions?limit=${limit}&offset=${offset}`,
    ),

  // ── Credentials / Enrollment ──────────────────────────────────────────
  issueCredential: (body: {
    merchantId: string;
    contact: { phone?: string; email?: string };
    displayName?: string;
    rewardsConsent: boolean;
    marketingConsent: boolean;
  }) => request<CredentialIssueResult>('/credentials/issue', {
    method: 'POST',
    body: JSON.stringify({
      merchantId:      body.merchantId,
      customerContact: body.contact,
      displayName:     body.displayName,
      rewardsConsent:  body.rewardsConsent,
      marketingConsent: body.marketingConsent
        ? { granted: true, channels: ['sms'] }
        : undefined,
    }),
  }),
};
