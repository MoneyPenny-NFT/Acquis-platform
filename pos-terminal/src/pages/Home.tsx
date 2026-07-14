import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { ItemButton } from '../components/ItemButton';
import { BottomNav } from '../components/BottomNav';
import { NumPad } from '../components/NumPad';

export function Home() {
  const navigate = useNavigate();
  const { merchant, catalog, customAmount, setCustomAmount, cartSubtotal, cartCount } = useSession();
  const [showNumpad, setShowNumpad] = useState(false);
  const [amountStr,  setAmountStr]  = useState(customAmount > 0 ? String(customAmount) : '');

  function applyCustom() {
    const n = parseFloat(amountStr);
    setCustomAmount(isNaN(n) || n <= 0 ? 0 : n);
    setShowNumpad(false);
  }

  function openNumpad() {
    setAmountStr(customAmount > 0 ? String(customAmount) : '');
    setShowNumpad(true);
  }

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">

      {/* Header */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-start justify-between">
          {/* Acquis wordmark */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-black italic text-pos-accent tracking-tight leading-none">
                Acquis
              </span>
              <span className="text-[9px] font-semibold text-pos-accent/60 uppercase tracking-widest
                               border border-pos-accent/30 rounded px-1.5 py-0.5 leading-none">
                POS
              </span>
            </div>
            <p className="text-base font-semibold text-pos-text leading-tight">{merchant.name}</p>
            {merchant.tagline && (
              <p className="text-xs text-pos-muted mt-0.5">{merchant.tagline}</p>
            )}
          </div>

          {/* Live network badge */}
          <div className="flex items-center gap-1.5 bg-pos-card border border-pos-border
                          rounded-xl px-3 py-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-pos-accent animate-pulse-teal" />
            <span className="text-[10px] font-bold text-pos-accent tracking-widest uppercase">
              HEDERA
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-pos-border mx-5" />

      {/* Catalog */}
      <div className="px-4 pt-5">
        <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-3 px-1">
          Menu
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {catalog.map(item => (
            <ItemButton key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* Custom amount */}
      <div className="px-4 pt-3">
        <button
          onClick={openNumpad}
          className="w-full py-3.5 rounded-2xl border border-dashed border-pos-border text-pos-muted
                     text-sm font-medium hover:border-pos-accent/50 hover:text-pos-accent transition-all duration-200"
        >
          {customAmount > 0
            ? `Custom: $${customAmount.toFixed(2)} — tap to change`
            : '+ Custom amount'}
        </button>
      </div>

      {/* Cart banner */}
      {cartCount > 0 && (
        <div className="fixed bottom-16 inset-x-0 z-30 px-4 pb-3 max-w-sm mx-auto">
          <button
            onClick={() => navigate('/cart')}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl
                       bg-pos-accent text-pos-bg font-bold shadow-teal-glow animate-pulse-teal
                       active:scale-[0.98] transition-transform duration-150"
          >
            <span className="flex items-center gap-2.5">
              <span className="bg-pos-bg/20 rounded-xl w-7 h-7 flex items-center justify-center
                               text-xs font-bold">
                {cartCount}
              </span>
              <span className="text-sm font-semibold">
                {cartCount === 1 ? '1 item' : `${cartCount} items`}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              ${cartSubtotal.toFixed(2)}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </button>
        </div>
      )}

      <BottomNav />

      {/* Custom amount modal */}
      {showNumpad && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end"
          onClick={e => { if (e.target === e.currentTarget) setShowNumpad(false); }}
        >
          <div className="w-full max-w-sm mx-auto bg-pos-surface rounded-t-3xl p-5 space-y-4
                          animate-slide-up border-t border-pos-border shadow-card">
            {/* Modal header */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold tracking-widest uppercase text-pos-dim">Custom Amount</p>
              <button
                onClick={() => setShowNumpad(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-pos-muted
                           hover:text-pos-text hover:bg-pos-border/50 text-xl transition-colors"
              >
                ×
              </button>
            </div>

            {/* Amount display */}
            <div className="bg-pos-card rounded-2xl p-5 text-center border border-pos-border shadow-card">
              <p className="text-[10px] font-semibold text-pos-muted tracking-widest mb-3 uppercase">
                Amount (USD)
              </p>
              <p className="text-5xl font-black text-pos-accent tabular-nums tracking-tight">
                ${amountStr === '' ? '0.00' : amountStr}
              </p>
            </div>

            <NumPad value={amountStr} onChange={setAmountStr} />

            <button
              onClick={applyCustom}
              disabled={!amountStr || parseFloat(amountStr) <= 0}
              className="w-full py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-base
                         shadow-teal-glow disabled:opacity-30 disabled:cursor-not-allowed
                         active:scale-[0.98] transition-all duration-150"
            >
              Add to Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
