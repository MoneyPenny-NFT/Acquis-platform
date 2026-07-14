import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  api,
  type CustomerBalance,
  type RewardEvent,
  type RedemptionResult,
  type RedemptionValidateResult,
  type RedemptionEvent,
  type RedemptionsResponse,
} from '../../api/client';
import { useApi } from '../../hooks/useApi';

const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID ?? 'merchant-1';
const HCS_TOPIC   = '0.0.9342744';

function fmtAqt(units: number) {
  return (units / 100).toFixed(2) + ' AQT';
}

function fmtCents(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

// ── Earn history table ──────────────────────────────────────────────────────

function EarnHistory({ events }: { events: RewardEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 p-6">No earn events yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-100">
            <th className="px-6 py-3">Type</th>
            <th className="px-6 py-3">AQT</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">HCS</th>
            <th className="px-6 py-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {events.map((e: RewardEvent) => (
            <tr key={e.id} className="hover:bg-gray-50">
              <td className="px-6 py-3 capitalize">{e.eventType.replace(/_/g, ' ')}</td>
              <td className="px-6 py-3 font-semibold">{fmtAqt(e.rewardUnits)}</td>
              <td className="px-6 py-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  e.status === 'completed'          ? 'bg-green-50 text-green-700' :
                  e.status === 'zero_guard'         ? 'bg-gray-100 text-gray-400' :
                  'bg-gray-100 text-gray-500'}`}>
                  {e.status}
                </span>
              </td>
              <td className="px-6 py-3">
                {e.hcsSequenceNumber != null ? (
                  <a href={`https://hashscan.io/testnet/topic/${HCS_TOPIC}`} target="_blank" rel="noreferrer"
                     className="text-xs text-brand-600 hover:underline">seq {e.hcsSequenceNumber} ↗</a>
                ) : '—'}
              </td>
              <td className="px-6 py-3 text-xs text-gray-400">{new Date(e.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Redemption history table ────────────────────────────────────────────────

function RedemptionHistory({ events, total }: { events: RedemptionEvent[]; total: number }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 p-6">No redemptions yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-100">
            <th className="px-6 py-3">AQT</th>
            <th className="px-6 py-3">Value</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">HCS</th>
            <th className="px-6 py-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {events.map((e: RedemptionEvent) => (
            <tr key={e.id} className="hover:bg-gray-50">
              <td className="px-6 py-3 font-semibold">{e.redeemDisplay}</td>
              <td className="px-6 py-3 text-gray-600">{fmtCents(e.valueCents)}</td>
              <td className="px-6 py-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  e.status === 'validated' ? 'bg-green-50 text-green-700' :
                  e.status === 'pending'   ? 'bg-yellow-50 text-yellow-700' :
                  e.status === 'expired'   ? 'bg-red-50 text-red-600' :
                  'bg-gray-100 text-gray-500'}`}>
                  {e.code?.status ?? e.status}
                </span>
              </td>
              <td className="px-6 py-3">
                {e.hcsSequenceNumber != null ? (
                  <a href={`https://hashscan.io/testnet/topic/${HCS_TOPIC}`} target="_blank" rel="noreferrer"
                     className="text-xs text-brand-600 hover:underline">seq {e.hcsSequenceNumber} ↗</a>
                ) : '—'}
              </td>
              <td className="px-6 py-3 text-xs text-gray-400">{new Date(e.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > events.length && (
        <p className="text-xs text-gray-400 px-6 py-3">Showing {events.length} of {total}</p>
      )}
    </div>
  );
}

// ── Redemption code card ────────────────────────────────────────────────────

function CodeCard({ result, onValidate }: {
  result: RedemptionResult;
  onValidate: (r: RedemptionValidateResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [validated, setValidated] = useState<RedemptionValidateResult | null>(null);

  async function handleValidate() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.validateRedeem({ code: result.code, merchantId: MERCHANT_ID });
      setValidated(r);
      onValidate(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  }

  if (validated) {
    return (
      <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-5 text-center">
        <p className="text-green-800 font-bold text-lg">Redemption confirmed!</p>
        <p className="text-green-700 text-sm mt-1">{validated.redeemDisplay} redeemed for {fmtCents(validated.valueCents)}</p>
        {validated.hcsSequenceNumber != null && (
          <a href={`https://hashscan.io/testnet/topic/${HCS_TOPIC}`} target="_blank" rel="noreferrer"
             className="text-xs text-brand-600 hover:underline mt-2 block">
            HCS seq {validated.hcsSequenceNumber} ↗
          </a>
        )}
      </div>
    );
  }

  const expiry = new Date(result.expiresAt);
  return (
    <div className="mt-4 rounded-xl bg-brand-50 border border-brand-200 p-5">
      <p className="text-xs text-brand-600 font-medium uppercase tracking-wide mb-2">Redemption Code</p>
      <p className="text-4xl font-mono font-bold text-gray-900 tracking-widest text-center py-3">
        {result.code}
      </p>
      <div className="flex justify-between text-xs text-gray-500 mt-2 mb-4">
        <span>{result.redeemDisplay} · {fmtCents(result.valueCents)} value</span>
        <span>Expires {expiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {expiry.toLocaleDateString()}</span>
      </div>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <button onClick={handleValidate} disabled={loading}
        className="w-full py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
        {loading ? 'Validating…' : 'Mark as Used (merchant counter scan)'}
      </button>
      <p className="text-xs text-gray-400 mt-2 text-center">
        Press this when the customer presents the code at the counter.
      </p>
    </div>
  );
}

// ── Redeem panel ────────────────────────────────────────────────────────────

function RedeemPanel({ acquisId, balance, onRedeemed }: {
  acquisId: string;
  balance: number;
  onRedeemed: () => void;
}) {
  const [open, setOpen]             = useState(false);
  const [units, setUnits]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [result, setResult]         = useState<RedemptionResult | null>(null);
  const [validated, setValidated]   = useState(false);

  function reset() {
    setUnits('');
    setResult(null);
    setError(null);
    setValidated(false);
    setOpen(false);
    onRedeemed();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(units, 10);
    if (!n || n <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.redeem({ acquisId, merchantId: MERCHANT_ID, redeemUnits: n });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redemption failed');
    } finally {
      setLoading(false);
    }
  }

  if (balance === 0) {
    return (
      <p className="text-xs text-gray-400 mt-3 text-center">
        No balance to redeem yet.
      </p>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-4 w-full py-2 text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors">
        Redeem AQT →
      </button>
    );
  }

  return (
    <div className="mt-4">
      {!result ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Units to redeem <span className="text-gray-400">(1 unit = $0.01 · balance: {fmtAqt(balance)})</span>
            </label>
            <input
              type="number"
              min={1}
              max={balance}
              value={units}
              onChange={e => setUnits(e.target.value)}
              placeholder={`1 – ${balance}`}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {units && parseInt(units) > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                = {fmtAqt(parseInt(units))} · {fmtCents(parseInt(units))} value
              </p>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !units || parseInt(units) <= 0}
              className="flex-1 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg transition-colors">
              {loading ? 'Issuing…' : 'Issue Code'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <CodeCard result={result} onValidate={() => setValidated(true)} />
          {validated && (
            <button onClick={reset}
              className="mt-3 w-full py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              Done
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Communication preferences ───────────────────────────────────────────────

function PreferencesPanel({ customer }: { customer: CustomerBalance }) {
  const [marketing, setMarketing]   = useState(customer.marketingConsentGranted);
  const [channels, setChannels]     = useState<string[]>(customer.marketingConsentChannels ?? []);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);

  function toggleChannel(ch: string) {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.updatePreferences(customer.acquisId, {
        marketingConsent: marketing,
        marketingChannels: marketing ? channels : [],
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Communication Preferences</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded bg-green-100 text-green-700 text-xs font-bold flex-shrink-0">✓</span>
          <div>
            <p className="text-sm font-medium text-gray-800">Rewards consent</p>
            <p className="text-xs text-gray-500">Granted at enrollment — immutable. Recorded on HCS.</p>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={marketing}
              onChange={e => setMarketing(e.target.checked)}
              className="accent-brand-600"
            />
            <span className="text-sm font-medium text-gray-800">Marketing communications</span>
          </label>
          {marketing && (
            <div className="mt-2 ml-7 flex gap-4">
              {['sms', 'email'].map(ch => (
                <label key={ch} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={channels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                    className="accent-brand-600"
                  />
                  {ch.toUpperCase()}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1 ml-7">
            No communications are sent at this time (OFFERS_SENDING_ENABLED=false).
          </p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && <p className="text-xs text-green-600">Preferences saved.</p>}

        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </form>
    </div>
  );
}

// ── Customer detail ─────────────────────────────────────────────────────────

function CustomerDetail({ customerId }: { customerId: string }) {
  const detail      = useApi<CustomerBalance>();
  const redemptions = useApi<RedemptionsResponse>();
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() {
    setRefreshKey(k => k + 1);
  }

  useEffect(() => {
    detail.execute(() => api.getCustomerBalance(customerId));
    redemptions.execute(() => api.getRedemptions(customerId));
  }, [customerId, refreshKey]);

  if (detail.loading) return <p className="text-sm text-gray-400 p-6">Loading…</p>;
  if (detail.error)   return <p className="text-sm text-red-500 p-6">{detail.error}</p>;
  if (!detail.data)   return null;

  const c = detail.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/rewards/customers" className="text-sm text-brand-600 hover:underline mb-4 block">
          ← All customers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 font-mono">{c.acquisId}</h1>
        <div className="flex gap-2 mt-2">
          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">{c.kycLevel}</span>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{c.tier}</span>
        </div>
      </div>

      {/* Stats + redemption */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-500">AQT Balance</p>
          {c.aqsBalance === 0 ? (
            <p className="mt-2 text-3xl font-bold text-gray-300">0.00 AQT</p>
          ) : (
            <p className="mt-2 text-3xl font-bold text-gray-900">{c.balanceDisplay}</p>
          )}
          <RedeemPanel acquisId={c.acquisId} balance={c.aqsBalance} onRedeemed={refresh} />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-500">Redemptions</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{redemptions.data?.total ?? 0}</p>
          <p className="mt-1 text-xs text-gray-400">total issued</p>
          {(redemptions.data?.total ?? 0) === 0 && (
            <p className="mt-3 text-xs text-gray-400">No redemptions yet. Issue a code from the balance card once the customer has earned rewards.</p>
          )}
        </div>
      </div>

      {/* Earn history */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-gray-800 px-6 py-4 border-b border-gray-100">
          Earn History <span className="text-gray-400 font-normal text-sm">(last 20)</span>
        </h2>
        <EarnHistory events={c.recentEvents ?? []} />
      </div>

      {/* Redemption history */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-gray-800 px-6 py-4 border-b border-gray-100">
          Redemption History
        </h2>
        {redemptions.loading ? (
          <p className="text-sm text-gray-400 p-6">Loading…</p>
        ) : (
          <RedemptionHistory events={redemptions.data?.events ?? []} total={redemptions.data?.total ?? 0} />
        )}
      </div>

      {/* Communication preferences */}
      <PreferencesPanel customer={c} />
    </div>
  );
}

// ── Customer list ───────────────────────────────────────────────────────────

export function Customers() {
  const { customerId } = useParams<{ customerId?: string }>();

  const events = useApi<ReturnType<typeof api.getRewardEvents> extends Promise<infer T> ? T : never>();
  const [search, setSearch]         = useState('');
  const [lookupId, setLookupId]     = useState('');
  const [lookupResult, setLookupResult] = useState<CustomerBalance | null>(null);
  const [lookupError, setLookupError]   = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      events.execute(() => api.getRewardEvents(MERCHANT_ID, 200));
    }
  }, [customerId]);

  if (customerId) return <CustomerDetail customerId={customerId} />;

  const customerMap = new Map<string, { id: string; events: number; lastSeen: string; totalAQT: number }>();
  for (const e of events.data?.events ?? []) {
    const existing = customerMap.get(e.customerId);
    if (existing) {
      existing.events++;
      existing.totalAQT += e.rewardUnits;
      if (e.createdAt > existing.lastSeen) existing.lastSeen = e.createdAt;
    } else {
      customerMap.set(e.customerId, { id: e.customerId, events: 1, totalAQT: e.rewardUnits, lastSeen: e.createdAt });
    }
  }

  const customers = Array.from(customerMap.values())
    .filter(c => !search || c.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    try {
      const data = await api.getCustomerBalance(lookupId.trim());
      setLookupResult(data);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Not found');
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <Link to="/rewards/enroll" className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
          + Enroll Customer
        </Link>
      </div>

      <form onSubmit={handleLookup} className="mb-6 flex gap-2">
        <input
          type="text"
          value={lookupId}
          onChange={e => setLookupId(e.target.value)}
          placeholder="Look up by acquisId (acq_…)"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button type="submit" disabled={!lookupId || lookupLoading}
          className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-40 transition-colors">
          {lookupLoading ? '…' : 'Look up'}
        </button>
      </form>

      {lookupError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{lookupError}</div>
      )}
      {lookupResult && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-gray-900">{lookupResult.acquisId}</p>
              <p className="text-sm text-gray-500">{lookupResult.kycLevel} · {lookupResult.tier}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{lookupResult.balanceDisplay}</p>
              <Link to={`/rewards/customers/${lookupResult.acquisId}`}
                className="text-xs text-brand-600 hover:underline">View wallet →</Link>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Known Customers {customers.length > 0 && <span className="text-gray-400 font-normal">({customers.length})</span>}
          </h2>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by ID…"
            className="px-3 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {events.loading && <p className="text-sm text-gray-400 p-6">Loading…</p>}

        {!events.loading && customers.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm mb-3">No reward events found yet.</p>
            <Link to="/rewards/issue"
              className="inline-block px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700">
              Issue first reward
            </Link>
          </div>
        )}

        {customers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3">Customer ID</th>
                  <th className="px-6 py-3">Events</th>
                  <th className="px-6 py-3">Total AQT Earned</th>
                  <th className="px-6 py-3">Last Seen</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs">{c.id}</td>
                    <td className="px-6 py-3">{c.events}</td>
                    <td className="px-6 py-3 font-semibold">{fmtAqt(c.totalAQT)}</td>
                    <td className="px-6 py-3 text-xs text-gray-400">{new Date(c.lastSeen).toLocaleDateString()}</td>
                    <td className="px-6 py-3">
                      <Link to={`/rewards/customers/${c.id}`} className="text-xs text-brand-600 hover:underline">
                        View wallet →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Customer list derived from reward events. Balances may differ from displayed totals if rewards were issued via other sessions.
      </p>
    </div>
  );
}
