import type { Receipt } from '../context/SessionContext';

interface Props { receipt: Receipt; }

export function ReceiptCard({ receipt }: Props) {
  const time = new Date(receipt.timestamp);

  return (
    <div className="bg-pos-card border border-pos-border rounded-2xl p-4 space-y-2 animate-fade-in">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${receipt.status === 'settled' ? 'bg-pos-success' : 'bg-pos-gold'}`} />
          <span className="text-xs text-pos-dim font-medium uppercase tracking-wide">
            {receipt.mode === 'bank' ? 'ACH' : receipt.mode}
          </span>
        </div>
        <span className="text-xs text-pos-muted">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <p className="text-sm text-pos-dim font-mono truncate max-w-[140px]">{receipt.toId}</p>
          <p className="text-xs text-pos-muted mt-0.5">
            {receipt.items.length > 0
              ? receipt.items.map(i => i.name).join(', ')
              : 'Custom amount'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-white tabular-nums">
            {receipt.total.toFixed(2)}
          </p>
          <p className="text-[10px] text-pos-muted uppercase">
            {receipt.mode === 'bank' ? 'USD' : receipt.mode === 'hbar' ? 'HBAR' : 'tokens'}
          </p>
        </div>
      </div>

      {receipt.status === 'processing' && (
        <p className="text-[10px] text-pos-gold">ACH transfer processing — settles in 2–3 days</p>
      )}
    </div>
  );
}
