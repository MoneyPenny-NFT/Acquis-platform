import { useState } from 'react';
import { api, type CredentialIssueResult } from '../../api/client';
import { Link } from 'react-router-dom';

type ReconcileState = 'idle' | 'loading' | { credited: number; totalRewardDisplay: string; unrecoverable: number };

const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID ?? 'merchant-1';
const NFT_TOKEN   = '0.0.9342217';

export function EnrollCustomer() {
  const [phone,       setPhone]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rewards,     setRewards]     = useState(false);
  const [marketing,   setMarketing]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState<CredentialIssueResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [reconcile,   setReconcile]   = useState<ReconcileState>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.issueCredential({
        merchantId:      MERCHANT_ID,
        contact:         { phone },
        displayName:     displayName || undefined,
        rewardsConsent:  rewards,
        marketingConsent: marketing,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleReconcile() {
    if (!result?.acquisId) return;
    setReconcile('loading');
    try {
      const r = await api.reconcile(result.acquisId, 30);
      setReconcile({ credited: r.credited, totalRewardDisplay: r.totalRewardDisplay, unrecoverable: r.unrecoverableCount });
    } catch {
      setReconcile('idle');
    }
  }

  function reset() {
    setPhone('');
    setDisplayName('');
    setRewards(false);
    setMarketing(false);
    setResult(null);
    setError(null);
    setReconcile('idle');
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Enroll Customer</h1>
      <p className="text-sm text-gray-500 mb-8">
        Issues an on-chain NFT credential (AQCID) and records consent to HCS.
      </p>

      {/* Success */}
      {result && (
        <div className={`mb-8 rounded-2xl border p-8 ${result.existing ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <p className={`text-lg font-bold mb-1 ${result.existing ? 'text-yellow-800' : 'text-green-800'}`}>
            {result.existing ? 'Customer already enrolled' : 'Customer enrolled!'}
          </p>
          <p className="text-sm text-gray-600 mb-4">{result.acquisId}</p>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">KYC Level</span>
              <span className="font-medium">{result.kycLevel}</span>
            </div>
            {result.nft && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">NFT Token</span>
                  <a href={`https://hashscan.io/testnet/token/${result.nft.tokenId}`}
                     target="_blank" rel="noreferrer"
                     className="font-mono text-xs text-brand-600 hover:underline">
                    {result.nft.tokenId} ↗
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Serial #</span>
                  <a href={`https://hashscan.io/testnet/token/${result.nft.tokenId}/${result.nft.serialNumber}`}
                     target="_blank" rel="noreferrer"
                     className="font-semibold text-brand-600 hover:underline">
                    #{result.nft.serialNumber} ↗
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mint Tx</span>
                  <a href={`https://hashscan.io/testnet/transaction/${result.nft.txId}`}
                     target="_blank" rel="noreferrer"
                     className="font-mono text-xs text-brand-600 hover:underline truncate max-w-[200px]">
                    HashScan ↗
                  </a>
                </div>
              </>
            )}
            {result.hcsSequenceNumber != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Consent HCS</span>
                <a href={`https://hashscan.io/testnet/topic/0.0.9342744`}
                   target="_blank" rel="noreferrer"
                   className="text-xs text-brand-600 hover:underline">
                  seq {result.hcsSequenceNumber} ↗
                </a>
              </div>
            )}
          </div>

          {/* Retroactive reconciliation */}
          {!result.existing && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              {reconcile === 'idle' && (
                <button onClick={handleReconcile}
                  className="w-full py-2 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors">
                  Check for past unmatched rewards (30 days) →
                </button>
              )}
              {reconcile === 'loading' && (
                <p className="text-sm text-center text-gray-400">Scanning past transactions…</p>
              )}
              {typeof reconcile === 'object' && (
                <div className="text-sm text-center space-y-0.5">
                  {reconcile.credited > 0
                    ? <p className="font-semibold text-green-700">{reconcile.credited} past reward{reconcile.credited !== 1 ? 's' : ''} credited — {reconcile.totalRewardDisplay}</p>
                    : <p className="text-gray-500">No matching past transactions found in last 30 days.</p>
                  }
                  {reconcile.unrecoverable > 0 && (
                    <p className="text-xs text-gray-400">{reconcile.unrecoverable} anonymous transaction{reconcile.unrecoverable !== 1 ? 's' : ''} could not be matched (no contact info).</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button onClick={reset}
              className="flex-1 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 text-sm transition-colors">
              Enroll Another
            </button>
            <Link to={`/rewards/customers/${result.acquisId}`}
              className="flex-1 py-2 text-center bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-700 text-sm transition-colors">
              View Customer →
            </Link>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Form */}
      {!result && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
          </div>

          {/* Consent — legal-locked copy, never change without attorney review */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rewards}
                onChange={e => setRewards(e.target.checked)}
                className="mt-1 accent-brand-600"
                required
              />
              <div>
                <p className="text-sm font-medium text-gray-800">
                  I agree to earn and receive AQT rewards <span className="text-red-500">*</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Required for enrollment. Recorded immutably on Hedera Consensus Service.
                </p>
              </div>
            </label>

            <hr className="border-gray-100" />

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={marketing}
                onChange={e => setMarketing(e.target.checked)}
                className="mt-1 accent-brand-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">
                  I agree to receive promotional offers
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Optional. Separate from rewards consent. You can opt out at any time.
                </p>
              </div>
            </label>
          </div>

          <p className="text-xs text-gray-400">
            Enrollment mints a custodial NFT on Hedera testnet ({NFT_TOKEN}) and writes consent to HCS topic 0.0.9342744.
          </p>

          <button
            type="submit"
            disabled={loading || !rewards}
            className="w-full py-4 bg-brand-600 text-white text-lg font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Enrolling…' : 'Enroll Customer'}
          </button>
        </form>
      )}
    </div>
  );
}
