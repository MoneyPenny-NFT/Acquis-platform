import { useState, useEffect, useCallback } from 'react';

const BASE        = import.meta.env.VITE_API_BASE_URL ?? '';
const API_KEY     = import.meta.env.VITE_API_KEY      ?? '';
const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID  ?? 'merchant-1';

const WEBHOOK_URL = `${BASE}/api/v1/webhooks/square/${MERCHANT_ID}`;

interface WebhookEvent {
  id: string;
  source: string;
  externalRef: string | null;
  amountCents: number | null;
  customerContact: string | null;
  customerId: string | null;
  rewardEventId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  credited:             'bg-green-100 text-green-800',
  customer_not_found:   'bg-yellow-100 text-yellow-800',
  duplicate:            'bg-gray-100 text-gray-600',
  error:                'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  credited:             'Credited',
  customer_not_found:   'Not enrolled',
  duplicate:            'Duplicate',
  error:                'Error',
};

function fmtAmount(cents: number | null) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtContact(raw: string | null) {
  if (!raw) return '—';
  try {
    const c = JSON.parse(raw);
    return c.phone ?? c.email ?? '—';
  } catch { return '—'; }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy}
      className="ml-2 px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function PosIntegration() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [total,  setTotal]  = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${BASE}/api/v1/merchants/${MERCHANT_ID}/webhooks/events?limit=50`,
        { headers: { 'x-api-key': API_KEY } },
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const credited  = events.filter(e => e.status === 'credited').length;
  const missed    = events.filter(e => e.status === 'customer_not_found').length;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">POS Integration</h1>
        <p className="text-sm text-gray-500">
          Connect your point-of-sale system to automatically credit AQT rewards on every sale.
        </p>
      </div>

      {/* Webhook URL */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Your webhook URL</h2>

        <div>
          <p className="text-xs text-gray-500 mb-1">Square → Webhook subscriptions → Add endpoint</p>
          <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
            <code className="text-xs text-gray-700 flex-1 break-all">{WEBHOOK_URL}</code>
            <CopyButton value={WEBHOOK_URL} />
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Subscribe to this event</p>
          <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
            <code className="text-xs text-gray-700 flex-1">payment.completed</code>
            <CopyButton value="payment.completed" />
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Paste your Square signature key into your Acquis .env</p>
          <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
            <code className="text-xs text-gray-700">SQUARE_WEBHOOK_SIGNATURE_KEY=your_key_here</code>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">How rewards fire</p>
          <p>When Square sends a <code>payment.completed</code> event, Acquis matches the buyer's email to an enrolled customer and credits AQT automatically. If the buyer is not enrolled, the transaction is logged as "Not enrolled" — no reward is lost, it's recorded and ready for the future queuing backstop.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total received',  value: total,    color: 'text-gray-900' },
          { label: 'Credited',        value: credited,  color: 'text-green-700' },
          { label: 'Not enrolled',    value: missed,    color: 'text-yellow-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Event log */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Recent webhook events</h2>
          <button onClick={load} className="text-xs text-brand-600 hover:underline">Refresh</button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : events.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No webhook events yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Events appear here once Square starts sending <code>payment.completed</code> webhooks.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="px-6 py-3 text-left font-medium">Time</th>
                <th className="px-6 py-3 text-left font-medium">Source</th>
                <th className="px-6 py-3 text-left font-medium">Amount</th>
                <th className="px-6 py-3 text-left font-medium">Contact</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {events.map(ev => (
                <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-500 tabular-nums">{fmtTime(ev.createdAt)}</td>
                  <td className="px-6 py-3">
                    <span className="capitalize text-gray-700">{ev.source}</span>
                  </td>
                  <td className="px-6 py-3 font-medium tabular-nums">{fmtAmount(ev.amountCents)}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{fmtContact(ev.customerContact)}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[ev.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[ev.status] ?? ev.status}
                    </span>
                    {ev.errorMessage && (
                      <p className="text-xs text-red-500 mt-0.5">{ev.errorMessage}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center pb-4">
        Generic POS endpoint: <code className="text-gray-500">{BASE}/api/v1/webhooks/pos/{MERCHANT_ID}</code>
        {' '}— use for the Acquis POS terminal or any custom integration.
      </p>
    </div>
  );
}
