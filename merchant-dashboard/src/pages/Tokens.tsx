import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';

export function Tokens() {
  const [form, setForm] = useState({ name: '', symbol: '', decimals: '2', initialSupply: '1000', treasuryAccountId: '', treasuryKey: '' });
  const [mint, setMint] = useState({ tokenId: '', supplyKey: '', amount: '100' });
  const [burn, setBurn] = useState({ tokenId: '', supplyKey: '', amount: '10' });
  const [assoc, setAssoc] = useState({ tokenId: '', accountId: '', accountKey: '' });

  const createOp = useApi<{ tokenId: string; name: string; symbol: string }>();
  const mintOp = useApi<{ minted: number; status: string }>();
  const burnOp = useApi<{ burned: number; status: string }>();
  const assocOp = useApi<void>();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Tokens</h1>

      {/* Create token */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Create Token</h2>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Name" value={form.name} onChange={set('name')} />
          <FormField label="Symbol" value={form.symbol} onChange={set('symbol')} />
          <FormField label="Decimals" type="number" value={form.decimals} onChange={set('decimals')} />
          <FormField label="Initial Supply" type="number" value={form.initialSupply} onChange={set('initialSupply')} />
        </div>
        <FormField label="Treasury Account ID" value={form.treasuryAccountId} onChange={set('treasuryAccountId')} />
        <FormField label="Treasury Private Key" value={form.treasuryKey} onChange={set('treasuryKey')} />
        <button
          disabled={createOp.loading}
          onClick={() => createOp.execute(() => api.createToken({ ...form, decimals: Number(form.decimals), initialSupply: Number(form.initialSupply) }))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {createOp.loading ? 'Creating…' : 'Create Token'}
        </button>
        {createOp.error && <Alert type="error" message={createOp.error} />}
        {createOp.data && <Alert type="success" message={`Token created: ${createOp.data.tokenId} (${createOp.data.symbol})`} />}
      </section>

      {/* Mint */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Mint Tokens</h2>
        <FormField label="Token ID" value={mint.tokenId} onChange={e => setMint(m => ({ ...m, tokenId: e.target.value }))} />
        <FormField label="Supply Key" value={mint.supplyKey} onChange={e => setMint(m => ({ ...m, supplyKey: e.target.value }))} />
        <FormField label="Amount" type="number" value={mint.amount} onChange={e => setMint(m => ({ ...m, amount: e.target.value }))} />
        <button
          disabled={mintOp.loading}
          onClick={() => mintOp.execute(() => api.mintTokens(mint.tokenId, mint.supplyKey, Number(mint.amount)))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {mintOp.loading ? 'Minting…' : 'Mint'}
        </button>
        {mintOp.error && <Alert type="error" message={mintOp.error} />}
        {mintOp.data && <Alert type="success" message={`Minted ${mintOp.data.minted} — ${mintOp.data.status}`} />}
      </section>

      {/* Burn */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Burn Tokens</h2>
        <FormField label="Token ID" value={burn.tokenId} onChange={e => setBurn(b => ({ ...b, tokenId: e.target.value }))} />
        <FormField label="Supply Key" value={burn.supplyKey} onChange={e => setBurn(b => ({ ...b, supplyKey: e.target.value }))} />
        <FormField label="Amount" type="number" value={burn.amount} onChange={e => setBurn(b => ({ ...b, amount: e.target.value }))} />
        <button
          disabled={burnOp.loading}
          onClick={() => burnOp.execute(() => api.burnTokens(burn.tokenId, burn.supplyKey, Number(burn.amount)))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {burnOp.loading ? 'Burning…' : 'Burn'}
        </button>
        {burnOp.error && <Alert type="error" message={burnOp.error} />}
        {burnOp.data && <Alert type="success" message={`Burned ${burnOp.data.burned} — ${burnOp.data.status}`} />}
      </section>

      {/* Associate */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Associate Token</h2>
        <FormField label="Token ID" value={assoc.tokenId} onChange={e => setAssoc(a => ({ ...a, tokenId: e.target.value }))} />
        <FormField label="Account ID" value={assoc.accountId} onChange={e => setAssoc(a => ({ ...a, accountId: e.target.value }))} />
        <FormField label="Account Private Key" value={assoc.accountKey} onChange={e => setAssoc(a => ({ ...a, accountKey: e.target.value }))} />
        <button
          disabled={assocOp.loading}
          onClick={() => assocOp.execute(() => api.associateToken(assoc.tokenId, assoc.accountId, assoc.accountKey))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {assocOp.loading ? 'Associating…' : 'Associate'}
        </button>
        {assocOp.error && <Alert type="error" message={assocOp.error} />}
        {assocOp.data !== null && !assocOp.error && !assocOp.loading && assocOp.data === undefined && (
          <Alert type="success" message="Token associated successfully" />
        )}
      </section>
    </div>
  );
}
