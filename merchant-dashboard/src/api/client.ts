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

export const api = {
  // Accounts
  createAccount: (initialHbar?: number) =>
    request<{ accountId: string; privateKey: string; publicKey: string }>('/accounts', {
      method: 'POST',
      body: JSON.stringify({ initialHbar }),
    }),
  getAccount: (accountId: string) =>
    request<{ accountId: string }>(`/accounts/${accountId}`),

  // Tokens
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

  // Transfers
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
};
