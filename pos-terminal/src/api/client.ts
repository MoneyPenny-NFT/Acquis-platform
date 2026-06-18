const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const API_KEY  = import.meta.env.VITE_API_KEY ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getAccount: (accountId: string) =>
    request<{ balance: number; accountId: string }>(`/accounts/${accountId}`),

  pay: (toAccountId: string, amount: number, mode = 'token', tokenId?: string) =>
    request<{ success: boolean; toAccountId: string; amount: number; mode: string; tokenId?: string }>(
      '/pay',
      { method: 'POST', body: JSON.stringify({ toAccountId, amount, mode, tokenId }) },
    ),

  payXrp: (amountCents: number) =>
    request<{ success: boolean; txHash: string; destinationTag: number; ledgerIndex?: number; fee?: string; amountCents: number; xrpAmount: string; merchantAddress: string }>(
      '/pay',
      { method: 'POST', body: JSON.stringify({ amountCents, mode: 'xrp' }) },
    ),

  xrpl: {
    getAccount: (address: string) =>
      request<{ address: string; xrpBalance: number; sequence: number }>(`/xrpl/accounts/${address}`),
  },

  bankLink: {
    createToken: (hederaAccountId: string) =>
      request<{ linkToken: string }>('/bank-link/token', {
        method: 'POST',
        body: JSON.stringify({ hederaAccountId }),
      }),

    exchange: (hederaAccountId: string, publicToken: string, accountId: string) =>
      request<{ bankAccountId: string; institutionName: string; accountMask: string; accountType: string }>(
        '/bank-link/exchange',
        { method: 'POST', body: JSON.stringify({ hederaAccountId, publicToken, accountId }) },
      ),

    list: (hederaAccountId: string) =>
      request<{ accounts: Array<{ id: string; institutionName: string; accountMask: string; accountType: string; createdAt: string }> }>(
        `/bank-link?hederaAccountId=${encodeURIComponent(hederaAccountId)}`,
      ),

    unlink: (id: string, hederaAccountId: string) =>
      request<void>(
        `/bank-link/${id}?hederaAccountId=${encodeURIComponent(hederaAccountId)}`,
        { method: 'DELETE' },
      ),
  },

  fund: (bankAccountId: string, hederaAccountId: string, amountCents: number) =>
    request<{ fundingRequestId: string; status: string; amountCents: number }>(
      '/fund',
      { method: 'POST', body: JSON.stringify({ bankAccountId, hederaAccountId, amountCents }) },
    ),
};
