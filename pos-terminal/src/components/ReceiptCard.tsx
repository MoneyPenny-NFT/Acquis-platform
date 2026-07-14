import { useState } from 'react';
import type { Receipt } from '../context/SessionContext';

interface Props { receipt: Receipt; }

export function ReceiptCard({ receipt }: Props) {
  const [open, setOpen] = useState(false);
  const time = new Date(receipt.timestamp);

  const hasChainProof = receipt.xrp || receipt.hcs || receipt.aqs;
  const isXrp = receipt.mode === 'xrp' || receipt.mode === 'x402';

  const unitLabel = 'USD';

  return (
    <div className="bg-pos-card border border-pos-border rounded-2xl overflow-hidden animate-fade-in">
      {/* Tappable header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-4 text-left"
      >
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${receipt.status === 'settled' ? 'bg-pos-success' : 'bg-pos-gold'}`} />
            <span className="text-xs text-pos-dim font-medium uppercase tracking-wide">
              {receipt.mode === 'bank' ? 'ACH' : receipt.mode.toUpperCase()}
            </span>
            {/* Chain badges */}
            {receipt.xrp && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                XRPL
              </span>
            )}
            {receipt.hcs && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                HCS
              </span>
            )}
            {receipt.aqs && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">
                AQS
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-pos-muted">
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {hasChainProof && (
              <svg
                className={`w-3.5 h-3.5 text-pos-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
        </div>

        <div className="flex justify-between items-end">
          <div>
            {receipt.toId && (
              <p className="text-sm text-pos-dim font-mono truncate max-w-[140px]">{receipt.toId}</p>
            )}
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
            <p className="text-[10px] text-pos-muted uppercase">{unitLabel}</p>
          </div>
        </div>

        {receipt.status === 'processing' && (
          <p className="text-[10px] text-pos-gold mt-1.5">ACH transfer processing — settles in 2–3 days</p>
        )}
      </button>

      {/* Expandable body */}
      {open && hasChainProof && (
        <div className="border-t border-pos-border px-4 pb-4 pt-3 space-y-3 text-xs">

          {/* Items breakdown */}
          {receipt.items.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-pos-muted uppercase tracking-widest mb-1.5">Items</p>
              {receipt.items.map(item => (
                <div key={item.id} className="flex justify-between text-pos-dim">
                  <span>{item.emoji} {item.name} × {item.quantity}</span>
                  <span className="tabular-nums">{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              {receipt.taxAmount > 0 && (
                <div className="flex justify-between text-pos-muted">
                  <span>Tax</span>
                  <span className="tabular-nums">{receipt.taxAmount.toFixed(2)}</span>
                </div>
              )}
              {receipt.tipAmount > 0 && (
                <div className="flex justify-between text-pos-muted">
                  <span>Tip</span>
                  <span className="tabular-nums">{receipt.tipAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* AQS reward */}
          {receipt.aqs && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/8 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-base">◆</span>
                <div>
                  <p className="text-[10px] text-green-400/70 uppercase tracking-widest">AQS Rewards Earned</p>
                  <p className="text-green-400 font-bold">+{receipt.aqs.rewardDisplay}</p>
                </div>
              </div>
              <span className="text-[10px] text-green-400/60">1% back</span>
            </div>
          )}

          {/* XRPL settlement */}
          {receipt.xrp && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className="text-[10px] text-pos-muted uppercase tracking-widest">XRPL Settlement</p>
              </div>
              <div className="bg-pos-bg/60 rounded-lg px-3 py-2">
                <p className="text-[10px] text-pos-muted mb-0.5">Tx Hash</p>
                <p className="font-mono text-emerald-400 break-all leading-snug">
                  {receipt.xrp.txHash.slice(0, 16)}…{receipt.xrp.txHash.slice(-8)}
                </p>
              </div>
            </div>
          )}

          {/* Hedera HCS record */}
          {receipt.hcs && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <p className="text-[10px] text-pos-muted uppercase tracking-widest">Hedera Consensus</p>
              </div>
              <div className="bg-pos-bg/60 rounded-lg px-3 py-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-pos-muted">Topic</span>
                  <span className="font-mono text-blue-400">{receipt.hcs.topicId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-pos-muted">Sequence #</span>
                  <span className="font-mono text-blue-400">{receipt.hcs.sequenceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-pos-muted">Tx ID</span>
                  <span className="font-mono text-blue-400 text-[10px] break-all text-right max-w-[55%]">
                    {receipt.hcs.transactionId}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
