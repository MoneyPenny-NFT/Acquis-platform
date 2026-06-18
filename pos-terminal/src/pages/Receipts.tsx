import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { ReceiptCard } from '../components/ReceiptCard';
import { BottomNav } from '../components/BottomNav';
import type { Receipt } from '../context/SessionContext';

function dateKey(ts: string) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function groupByDate(receipts: Receipt[]): Array<{ label: string; items: Receipt[]; total: number }> {
  const map = new Map<string, Receipt[]>();
  for (const r of receipts) {
    const key = dateKey(r.timestamp);
    const bucket = map.get(key) ?? [];
    bucket.push(r);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([label, items]) => ({
    label,
    items,
    total: items.reduce((s, r) => s + r.total, 0),
  }));
}

export function Receipts() {
  const { receipts } = useSession();
  const navigate     = useNavigate();
  const groups       = groupByDate(receipts);

  const grandTotal = receipts.reduce((s, r) => s + r.total, 0);

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-widest uppercase">Orders</h1>
        </div>
        {receipts.length > 0 && (
          <div className="text-right">
            <p className="text-[10px] text-pos-muted tracking-widest uppercase">All time</p>
            <p className="text-sm font-bold text-pos-accent tabular-nums">
              {grandTotal.toFixed(2)}
            </p>
          </div>
        )}
      </div>
      <div className="h-px bg-pos-border mx-5" />

      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-none">
        {receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-pos-card border border-pos-border flex items-center justify-center">
              <svg className="w-6 h-6 text-pos-muted" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192
                     a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75
                     0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668
                     2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875
                     c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504
                     1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
              </svg>
            </div>
            <p className="text-sm text-pos-muted">No transactions yet</p>
            <button
              onClick={() => navigate('/')}
              className="text-xs text-pos-accent hover:underline"
            >
              Start a new transaction →
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <section key={group.label}>
                {/* Date header */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-pos-muted tracking-widest uppercase">{group.label}</p>
                  <p className="text-xs font-bold text-pos-dim tabular-nums">
                    {group.total.toFixed(2)}
                  </p>
                </div>

                {/* Receipt cards */}
                <div className="space-y-2">
                  {group.items.map(r => (
                    <ReceiptCard key={r.id} receipt={r} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
