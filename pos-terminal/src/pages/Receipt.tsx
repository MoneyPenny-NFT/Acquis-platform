import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import type { Receipt as ReceiptType, XrpProof } from '../context/SessionContext';

export function Receipt() {
  const { state } = useLocation() as { state: { receipt: ReceiptType } | null };
  const navigate  = useNavigate();

  if (!state?.receipt) { navigate('/'); return null; }
  const { receipt } = state;

  const isXrp  = receipt.mode === 'xrp';
  const isBank = receipt.mode === 'bank';
  const unitLabel = receipt.mode === 'hbar' ? 'HBAR' : receipt.mode === 'bank' ? 'USD' : receipt.mode === 'xrp' ? 'XRP' : 'tokens';

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">
      {/* Status hero */}
      <div className="flex flex-col items-center justify-center pt-10 pb-6 px-5">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4
          ${isBank
            ? 'bg-pos-gold/10 border-2 border-pos-gold'
            : 'bg-pos-success/10 border-2 border-pos-success'
          }`}
        >
          {isBank ? (
            <svg className="w-9 h-9 text-pos-gold" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          ) : (
            <svg className="w-9 h-9 text-pos-success check-path" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </div>

        <h1 className={`text-2xl font-bold tracking-widest ${isBank ? 'text-pos-gold' : 'text-pos-success'}`}>
          {isBank ? 'PROCESSING' : 'APPROVED'}
        </h1>
        <p className="text-sm text-pos-muted mt-1">
          {isBank ? 'ACH transfer initiated' : isXrp ? 'Payment confirmed on XRP Ledger' : 'Payment confirmed on Hedera'}
        </p>
      </div>

      <div className="h-px bg-pos-border mx-5" />

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none">

        {/* Amount highlight */}
        <div className="bg-pos-card rounded-2xl border border-pos-border p-5 text-center">
          <p className="text-[10px] text-pos-muted tracking-widest uppercase mb-1">Total Charged</p>
          <p className="text-4xl font-bold text-white tabular-nums">
            {receipt.total.toFixed(2)}
          </p>
          <p className="text-sm text-pos-muted mt-1 uppercase tracking-wide">{unitLabel}</p>
        </div>

        {/* Items */}
        {(receipt.items.length > 0 || receipt.customAmount > 0) && (
          <div className="bg-pos-card rounded-2xl border border-pos-border px-4 divide-y divide-pos-border">
            {receipt.items.map(item => (
              <div key={item.id} className="flex justify-between items-center py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg w-7 text-center">{item.emoji}</span>
                  <span className="text-sm">{item.name} × {item.quantity}</span>
                </div>
                <span className="text-sm tabular-nums">{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {receipt.customAmount > 0 && (
              <div className="flex justify-between items-center py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg w-7 text-center">✏️</span>
                  <span className="text-sm">Custom amount</span>
                </div>
                <span className="text-sm tabular-nums">{receipt.customAmount.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Breakdown */}
        <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-2">
          <Row label="Subtotal"  value={receipt.subtotal.toFixed(2)} />
          <Row label="Tax"       value={receipt.taxAmount.toFixed(2)} />
          {receipt.tipAmount > 0 && <Row label="Tip" value={receipt.tipAmount.toFixed(2)} />}
          <div className="h-px bg-pos-border my-1" />
          <Row label="Total" value={`${receipt.total.toFixed(2)} ${unitLabel}`} bold accent />
        </div>

        {/* Details */}
        <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-2">
          {receipt.toId && <Row label="Customer" value={receipt.toId} mono />}
          <Row label="Merchant" value={receipt.merchantName} />
          <Row
            label="Method"
            value={
              receipt.mode === 'bank' ? 'ACH Bank Transfer'
              : receipt.mode === 'hbar' ? 'HBAR'
              : receipt.mode === 'xrp' ? 'XRP Ledger'
              : `Token${receipt.tokenId ? ` (${receipt.tokenId})` : ''}`
            }
          />
          <Row label="Status" value={receipt.status === 'settled' ? 'Settled' : 'Processing'} />
          <div className="h-px bg-pos-border my-1" />
          <p className="text-xs text-pos-muted text-center">
            {new Date(receipt.timestamp).toLocaleString()}
          </p>
        </div>

        {/* XRP on-chain proof */}
        {isXrp && receipt.xrp && <XrpDetails proof={receipt.xrp} />}

        {isBank && (
          <div className="rounded-xl border border-pos-gold/30 bg-pos-gold/5 p-3">
            <p className="text-xs text-pos-gold leading-relaxed">
              ACH transfers typically settle in 2–3 business days. Tokens will be credited
              to the customer's Hedera account upon settlement.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="fixed bottom-16 inset-x-0 px-4 pb-2 max-w-sm mx-auto z-30 flex gap-3">
        <button
          onClick={() => navigate('/receipts')}
          className="flex-1 py-4 rounded-2xl border border-pos-border text-pos-dim font-bold text-sm
                     active:scale-[0.98] transition-transform hover:border-pos-muted"
        >
          View History
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex-1 py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-sm
                     shadow-lg shadow-pos-accent/20 active:scale-[0.98] transition-transform"
        >
          New Transaction
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

function XrpDetails({ proof }: { proof: XrpProof }) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);

  function copyHash() {
    navigator.clipboard.writeText(proof.txHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-pos-card rounded-2xl border border-pos-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left
                   hover:bg-white/5 transition-colors active:bg-white/10"
      >
        <span className="text-xs text-pos-muted tracking-widest uppercase">Transaction details</span>
        <svg
          className={`w-4 h-4 text-pos-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-pos-border pt-3">

          {/* tx hash */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-pos-muted tracking-widest uppercase">Transaction hash</p>
            <div className="flex items-center gap-2 bg-pos-bg rounded-xl p-2.5">
              <p className="text-xs font-mono text-pos-dim break-all flex-1 leading-relaxed">
                {proof.txHash}
              </p>
              <button
                onClick={copyHash}
                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-pos-border text-[10px] font-bold
                           text-pos-muted hover:text-white hover:border-pos-muted transition-colors
                           active:scale-95"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <a
              href={`https://testnet.xrpl.org/transactions/${proof.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-pos-accent hover:underline w-fit"
            >
              View on XRPL Explorer
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>

          {/* routing tag + ledger index */}
          <div className="space-y-2">
            {proof.ledgerIndex != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-pos-muted">Confirmed in ledger</span>
                <span className="text-xs font-mono text-white tabular-nums">#{proof.ledgerIndex.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-xs text-pos-muted">Routing tag</span>
              <span className="text-xs font-mono text-white tabular-nums">{proof.destinationTag}</span>
            </div>
            {proof.fee && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-pos-muted">Network fee</span>
                <span className="text-xs font-mono text-pos-muted tabular-nums">{proof.fee} drops</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, bold, accent, mono,
}: {
  label: string; value: string; bold?: boolean; accent?: boolean; mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-sm text-pos-muted shrink-0">{label}</span>
      <span className={`text-sm text-right truncate tabular-nums
        ${bold ? 'font-bold' : ''}
        ${accent ? 'text-pos-accent' : 'text-white'}
        ${mono ? 'font-mono text-xs' : ''}
      `}>
        {value}
      </span>
    </div>
  );
}
