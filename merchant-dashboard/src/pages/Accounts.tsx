import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';

export function Accounts() {
  const [initialHbar, setInitialHbar] = useState('10');
  const [lookupId, setLookupId] = useState('');
  const create = useApi<{ accountId: string; privateKey: string; publicKey: string }>();
  const lookup = useApi<{ accountId: string }>();

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>

      {/* Create */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Create Account</h2>
        <FormField
          label="Initial HBAR balance"
          type="number"
          value={initialHbar}
          onChange={e => setInitialHbar(e.target.value)}
        />
        <button
          disabled={create.loading}
          onClick={() => create.execute(() => api.createAccount(Number(initialHbar)))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {create.loading ? 'Creating…' : 'Create Account'}
        </button>
        {create.error && <Alert type="error" message={create.error} />}
        {create.data && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm font-mono break-all">
            <p><span className="font-sans font-medium text-gray-600">Account ID: </span>{create.data.accountId}</p>
            <p><span className="font-sans font-medium text-gray-600">Public Key: </span>{create.data.publicKey}</p>
            <p><span className="font-sans font-medium text-gray-600">Private Key: </span>{create.data.privateKey}</p>
          </div>
        )}
      </section>

      {/* Lookup */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Look Up Account</h2>
        <FormField
          label="Account ID (e.g. 0.0.12345)"
          value={lookupId}
          onChange={e => setLookupId(e.target.value)}
        />
        <button
          disabled={lookup.loading || !lookupId}
          onClick={() => lookup.execute(() => api.getAccount(lookupId))}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {lookup.loading ? 'Looking up…' : 'Look Up'}
        </button>
        {lookup.error && <Alert type="error" message={lookup.error} />}
        {lookup.data && (
          <Alert type="success" message={`Found: ${JSON.stringify(lookup.data)}`} />
        )}
      </section>
    </div>
  );
}
