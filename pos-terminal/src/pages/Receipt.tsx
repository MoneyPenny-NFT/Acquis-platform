import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import type { Receipt as ReceiptType, XrpProof, HcsProof, AqsReward } from '../context/SessionContext';

export function Receipt() {
  const { state } = useLocation() as { state: { receipt: ReceiptType } | null };
  const navigate  = useNavigate();

  if (!state?.receipt) { navigate('/'); return null; }
  const { receipt } = state;

  const isXrp  = receipt.mode === 'xrp' || receipt.mode === 'x402';
  const isBank = receipt.mode === 'bank';

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">

      {/* Status hero */}
      <div className="flex flex-col items-center justify-center pt-10 pb-6 px-5">
        {/* Acquis wordmark */}
        <span className="text-sm font-black italic text-pos-accent tracking-tight mb-6 opacity-60">
          Acquis
        </span>

        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5
          ${isBank
            ? 'bg-pos-gold/10 border-2 border-pos-gold animate-pulse-gold'
            : 'bg-pos-accent/10 border-2 border-pos-accent animate-pulse-teal'
          }`}
        >
          {isBank ? (
            <svg className="w-9 h-9 text-pos-gold" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          ) : (
            <svg className="w-9 h-9 text-pos-accent check-path animated" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </div>

        <h1 className={`text-2xl font-black tracking-widest ${isBank ? 'text-pos-gold' : 'text-pos-accent'}`}>
          {isBank ? 'PROCESSING' : 'APPROVED'}
        </h1>
        <p className="text-sm text-pos-muted mt-2 text-center leading-relaxed">
          {isBank ? 'ACH transfer initiated'
            : (isXrp && receipt.hcs) ? 'Settled on XRP Ledger · Recorded on Hedera'
            : isXrp ? 'Payment confirmed on XRP Ledger'
            : 'Payment confirmed · Rules verified on Hedera'}
        </p>
      </div>

      <div className="h-px bg-pos-border mx-5" />

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 scrollbar-none">

        {/* Amount hero */}
        <div className="bg-pos-card rounded-2xl border border-pos-border p-5 text-center shadow-card">
          <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-2">
            Total Charged
          </p>
          <p className="text-5xl font-black text-pos-text tabular-nums tracking-tight">
            ${receipt.total.toFixed(2)}
          </p>
          <p className="text-xs font-semibold text-pos-muted mt-2 uppercase tracking-widest">USD</p>
        </div>

        {/* Items */}
        {(receipt.items.length > 0 || receipt.customAmount > 0) && (
          <div className="bg-pos-card rounded-2xl border border-pos-border px-4 divide-y divide-pos-border shadow-card">
            {receipt.items.map(item => (
              <div key={item.id} className="flex justify-between items-center py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg w-7 text-center">{item.emoji}</span>
                  <span className="text-sm font-medium text-pos-text">
                    {item.name} × {item.quantity}
                  </span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-pos-text">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
            {receipt.customAmount > 0 && (
              <div className="flex justify-between items-center py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg w-7 text-center">✏️</span>
                  <span className="text-sm font-medium text-pos-text">Custom amount</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-pos-text">
                  ${receipt.customAmount.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Breakdown */}
        <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-2.5 shadow-card">
          <Row label="Subtotal"  value={`$${receipt.subtotal.toFixed(2)}`} />
          <Row label="Tax"       value={`$${receipt.taxAmount.toFixed(2)}`} />
          {receipt.tipAmount > 0 && <Row label="Tip" value={`$${receipt.tipAmount.toFixed(2)}`} />}
          <div className="h-px bg-pos-border my-1" />
          <Row label="Total" value={`$${receipt.total.toFixed(2)}`} bold accent />
        </div>

        {/* Details */}
        <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-2.5 shadow-card">
          {receipt.toId && <Row label="Customer" value={receipt.toId} mono />}
          <Row label="Merchant" value={receipt.merchantName} />
          <Row
            label="Method"
            value={
              receipt.mode === 'bank'  ? 'ACH Bank Transfer'
              : receipt.mode === 'hbar'  ? 'HBAR'
              : receipt.mode === 'xrp'   ? 'XRP Ledger'
              : receipt.mode === 'x402'  ? 'x402 / XRP Ledger'
              : `Token${receipt.tokenId ? ` (${receipt.tokenId})` : ''}`
            }
          />
          <Row label="Status" value={receipt.status === 'settled' ? 'Settled' : 'Processing'} />
          <div className="h-px bg-pos-border my-1" />
          <p className="text-xs text-pos-muted text-center">
            {new Date(receipt.timestamp).toLocaleString()}
          </p>
        </div>

        {/* AQS rewards */}
        {receipt.aqs && <AqsCard reward={receipt.aqs} tokenId="0.0.9199123" />}

        {/* XRPL Settlement */}
        {isXrp && receipt.xrp && <XrpDetails proof={receipt.xrp} />}

        {/* Hedera Ledger — always shown */}
        <HcsCard proof={receipt.hcs} nftCollection="0.0.9342217" />

        {isBank && (
          <div className="rounded-2xl border border-pos-gold/30 bg-pos-gold/5 p-4 shadow-card">
            <p className="text-xs text-pos-gold leading-relaxed">
              ACH transfers typically settle in 2–3 business days. Tokens will be credited
              to the customer's Hedera account upon settlement.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="fixed bottom-16 inset-x-0 px-4 pb-3 max-w-sm mx-auto z-30 flex gap-3">
        <button
          onClick={() => navigate('/receipts')}
          className="flex-1 py-4 rounded-2xl border border-pos-border text-pos-dim font-semibold text-sm
                     active:scale-[0.98] transition-transform hover:border-pos-muted hover:text-pos-text"
        >
          Orders
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex-1 py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-sm
                     shadow-teal-glow active:scale-[0.98] transition-transform"
        >
          New Sale
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
    <div className="rounded-2xl border border-pos-border overflow-hidden shadow-card"
         style={{ borderLeft: '3px solid #02C39A' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left
                   bg-pos-card hover:bg-pos-border/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-pos-accent shrink-0" />
          <span className="text-xs font-bold tracking-widest uppercase text-pos-accent">
            XRPL Settlement
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-pos-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="bg-pos-card px-4 pb-4 space-y-4 border-t border-pos-border pt-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase">
              Transaction Hash
            </p>
            <div className="flex items-center gap-2 bg-pos-bg rounded-xl p-3 border border-pos-border">
              <p className="text-xs font-mono text-pos-accent break-all flex-1 leading-relaxed">
                {proof.txHash}
              </p>
              <button
                onClick={copyHash}
                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-pos-border text-[10px] font-bold
                           text-pos-muted hover:text-pos-accent hover:border-pos-accent/40 transition-colors active:scale-95"
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
            <a
              href={`https://testnet.xrpl.org/transactions/${proof.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-pos-accent hover:underline"
            >
              View on XRPL Explorer
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>

          <div className="space-y-2.5">
            {proof.ledgerIndex != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-pos-muted">Ledger index</span>
                <span className="text-xs font-mono text-pos-text tabular-nums">
                  #{proof.ledgerIndex.toLocaleString()}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-xs text-pos-muted">Routing tag</span>
              <span className="text-xs font-mono text-pos-text tabular-nums">{proof.destinationTag}</span>
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

function AqsCard({ reward, tokenId }: { reward: AqsReward; tokenId: string }) {
  return (
    <div className="rounded-2xl border border-pos-gold/40 overflow-hidden shadow-gold-glow"
         style={{ borderLeft: '3px solid #D4AC50' }}>
      <div className="bg-pos-card px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-pos-gold/15 border border-pos-gold/30
                          flex items-center justify-center shrink-0">
            <span className="text-pos-gold text-xs font-black">◆</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-pos-gold/70 tracking-widest uppercase">
              AQS Rewards
            </p>
            <p className="text-lg font-black text-pos-gold tabular-nums leading-tight">
              +{reward.rewardDisplay}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-pos-gold/60 font-semibold">1% cashback</p>
          <p className="text-[10px] font-mono text-pos-gold/50 mt-0.5">{tokenId}</p>
        </div>
      </div>
    </div>
  );
}

function HcsCard({ proof, nftCollection }: { proof?: HcsProof; nftCollection: string }) {
  const [open, setOpen]     = useState(true);
  const [copied, setCopied] = useState(false);

  function copyTxId() {
    if (!proof) return;
    navigator.clipboard.writeText(proof.transactionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const time = proof
    ? new Date(proof.consensusTimestamp).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : null;

  return (
    <div className="rounded-2xl border border-blue-500/40 overflow-hidden shadow-card"
         style={{ borderLeft: '3px solid #3B82F6' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left
                   bg-pos-card hover:bg-pos-border/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
          <span className="text-xs font-bold tracking-widest uppercase text-blue-400">
            Hedera Ledger
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-pos-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="bg-pos-card px-4 pb-4 pt-1 space-y-4 border-t border-pos-border">

          {/* Confirmation banner */}
          <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 px-3 py-3
                          flex items-start gap-2.5">
            <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none"
                 stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-blue-300 leading-snug">
                Customer agreement rules confirmed
              </p>
              <p className="text-[10px] text-blue-400/65 mt-0.5 leading-relaxed">
                Transaction policy verified and recorded immutably on Hedera Consensus Service
                before funds moved.
              </p>
            </div>
          </div>

          {/* HCS proof — when write succeeded */}
          {proof && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase">
                Hedera Confirmation Hash
              </p>
              <div className="flex items-center gap-2 bg-pos-bg rounded-xl p-3 border border-pos-border">
                <p className="text-xs font-mono text-blue-300 break-all flex-1 leading-relaxed">
                  {proof.transactionId}
                </p>
                <button
                  onClick={copyTxId}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg border border-pos-border text-[10px] font-bold
                             text-pos-muted hover:text-blue-400 hover:border-blue-500/40
                             transition-colors active:scale-95"
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
              <a
                href={`https://hashscan.io/testnet/topic/${proof.topicId}?sequenceNumber=${proof.sequenceNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-400 hover:underline"
              >
                Verify on HashScan
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>

              <div className="space-y-2 border-t border-pos-border pt-3 mt-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-pos-muted">Topic</span>
                  <span className="text-xs font-mono text-pos-text tabular-nums">{proof.topicId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-pos-muted">Sequence #</span>
                  <span className="text-xs font-mono font-bold text-blue-400 tabular-nums">
                    #{proof.sequenceNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-pos-muted">Consensus time</span>
                  <span className="text-xs font-mono text-pos-dim tabular-nums">{time}</span>
                </div>
              </div>
            </div>
          )}

          {/* NFT Credential */}
          <div className="border-t border-pos-border pt-3 space-y-2.5">
            <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase">
              NFT Credential
            </p>
            <div className="flex justify-between items-center">
              <span className="text-xs text-pos-muted">Collection</span>
              <span className="text-xs font-mono text-pos-text">{nftCollection}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-pos-muted">Status</span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-pos-success">
                <span className="w-1.5 h-1.5 rounded-full bg-pos-success" />
                Active
              </span>
            </div>
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
        ${bold ? 'font-bold' : 'font-medium'}
        ${accent ? 'text-pos-accent' : 'text-pos-text'}
        ${mono ? 'font-mono text-xs' : ''}
      `}>
        {value}
      </span>
    </div>
  );
}
