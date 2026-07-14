import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, type RewardEvent } from '../../api/client';
import { StatCard } from '../../components/StatCard';
import { useApi } from '../../hooks/useApi';

const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID ?? 'merchant-1';
const HCS_TOPIC   = '0.0.9342744';
const AQT_TOKEN   = '0.0.9199123';

function fmt(units: number) {
  return (units / 100).toFixed(2) + ' AQT';
}

function eventTypePill(type: string) {
  const map: Record<string, string> = {
    purchase:      'bg-blue-50 text-blue-700',
    checkin:       'bg-purple-50 text-purple-700',
    referral:      'bg-green-50 text-green-700',
    signup_bonus:  'bg-yellow-50 text-yellow-700',
    manual_credit: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  );
}

function statusPill(status: string) {
  const ok = status === 'completed';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ok ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

export function RewardsDashboard() {
  const summary = useApi<ReturnType<typeof api.getRewardsSummary> extends Promise<infer T> ? T : never>();
  const events  = useApi<ReturnType<typeof api.getRewardEvents> extends Promise<infer T> ? T : never>();

  useEffect(() => {
    summary.execute(() => api.getRewardsSummary(MERCHANT_ID));
    events.execute(() => api.getRewardEvents(MERCHANT_ID, 10));
  }, []);

  const s = summary.data;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rewards Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Merchant <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{MERCHANT_ID}</code></p>
        </div>
        <Link
          to="/rewards/issue"
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
        >
          + Issue Reward
        </Link>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Issued Today"
          value={s ? fmt(s.issuedToday) : '—'}
          sub="AQT credited today"
        />
        <StatCard
          label="This Week"
          value={s ? fmt(s.issuedWeek) : '—'}
          sub="rolling 7 days"
        />
        <StatCard
          label="This Month"
          value={s ? fmt(s.issuedMonth) : '—'}
          sub="month-to-date"
        />
        <StatCard
          label="Active Customers"
          value={s ? s.activeCustomers : '—'}
          sub="enrolled & active"
        />
        <StatCard
          label="Outstanding"
          value={s ? fmt(s.totalOutstanding) : '—'}
          sub="total AQT unredeemed"
        />
      </div>

      {summary.error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {summary.error} — is the api-gateway running at :3000?
        </div>
      )}

      {/* Recent events */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Recent Events</h2>
          <Link to="/rewards/customers" className="text-xs text-brand-600 hover:underline">
            View customers →
          </Link>
        </div>

        {events.loading && (
          <p className="text-sm text-gray-400 p-6">Loading…</p>
        )}

        {!events.loading && (!events.data?.events?.length) && (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm mb-3">No rewards issued yet.</p>
            <Link
              to="/rewards/issue"
              className="inline-block px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700"
            >
              Issue your first reward
            </Link>
          </div>
        )}

        {events.data?.events && events.data.events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Event</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">AQT</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">HCS</th>
                  <th className="px-6 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.data.events.map((e: RewardEvent) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs text-gray-700">
                      <Link to={`/rewards/customers/${e.customerId}`} className="hover:text-brand-600">
                        {e.customerId}
                      </Link>
                    </td>
                    <td className="px-6 py-3">{eventTypePill(e.eventType)}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {e.amountCents != null ? `$${(e.amountCents / 100).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-6 py-3 font-semibold text-gray-900">{fmt(e.rewardUnits)}</td>
                    <td className="px-6 py-3">{statusPill(e.status)}</td>
                    <td className="px-6 py-3">
                      {e.hcsSequenceNumber != null ? (
                        <a
                          href={`https://hashscan.io/testnet/topic/${HCS_TOPIC}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-600 hover:underline"
                        >
                          seq {e.hcsSequenceNumber}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-400">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* On-chain links */}
      <div className="mt-6 flex gap-4 text-xs text-gray-400">
        <a href={`https://hashscan.io/testnet/topic/${HCS_TOPIC}`} target="_blank" rel="noreferrer"
           className="hover:text-brand-600">HCS Topic {HCS_TOPIC} ↗</a>
        <a href={`https://hashscan.io/testnet/token/${AQT_TOKEN}`} target="_blank" rel="noreferrer"
           className="hover:text-brand-600">AQT Token {AQT_TOKEN} ↗</a>
      </div>
    </div>
  );
}
