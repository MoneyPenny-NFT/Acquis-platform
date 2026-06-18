import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';

export function Transfers() {
  const [hbar, setHbar] = useState({ fromId: '', fromKey: '', toId: '', amount: '1' });
  const [token, setToken] = useState({ tokenId: '', fromId: '', fromKey: '', toId: '', amount: '10' });

  const hbarOp = useApi<{ fromId: string; toId: string; amount: number; asset: string }>();
  const tokenOp = useApi<{ tokenId: string; fromId: string; toId: string; amount: number }>();

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Transfers</h1>

      {/* HBAR */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Transfer HBAR</h2>
        <FormField label="From Account ID" value={hbar.fromId} onChange={e => setHbar(h => ({ ...h, fromId: e.target.value }))} />
        <FormField label="From Private Key" value={hbar.fromKey} onChange={e => setHbar(h => ({ ...h, fromKey: e.target.value }))} />
        <FormField label="To Account ID" value={hbar.toId} onChange={e => setHbar(h => ({ ...h, toId: e.target.value }))} />
        <FormField label="Amount (HBAR)" type="number" value={hbar.amount} onChange={e => setHbar(h => ({ ...h, amount: e.target.value }))} />
        <button
          disabled={hbarOp.loading}
          onClick={() => hbarOp.execute(() => api.transferHbar(hbar.fromId, hbar.fromKey, hbar.toId, Number(hbar.amount)))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {hbarOp.loading ? 'Sending…' : 'Send HBAR'}
        </button>
        {hbarOp.error && <Alert type="error" message={hbarOp.error} />}
        {hbarOp.data && <Alert type="success" message={`Sent ${hbarOp.data.amount} HBAR from ${hbarOp.data.fromId} → ${hbarOp.data.toId}`} />}
      </section>

      {/* Token */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Transfer Token</h2>
        <FormField label="Token ID" value={token.tokenId} onChange={e => setToken(t => ({ ...t, tokenId: e.target.value }))} />
        <FormField label="From Account ID" value={token.fromId} onChange={e => setToken(t => ({ ...t, fromId: e.target.value }))} />
        <FormField label="From Private Key" value={token.fromKey} onChange={e => setToken(t => ({ ...t, fromKey: e.target.value }))} />
        <FormField label="To Account ID" value={token.toId} onChange={e => setToken(t => ({ ...t, toId: e.target.value }))} />
        <FormField label="Amount" type="number" value={token.amount} onChange={e => setToken(t => ({ ...t, amount: e.target.value }))} />
        <button
          disabled={tokenOp.loading}
          onClick={() => tokenOp.execute(() => api.transferToken(token.tokenId, token.fromId, token.fromKey, token.toId, Number(token.amount)))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {tokenOp.loading ? 'Sending…' : 'Send Token'}
        </button>
        {tokenOp.error && <Alert type="error" message={tokenOp.error} />}
        {tokenOp.data && <Alert type="success" message={`Sent ${tokenOp.data.amount} tokens (${tokenOp.data.tokenId}) → ${tokenOp.data.toId}`} />}
      </section>
    </div>
  );
}
