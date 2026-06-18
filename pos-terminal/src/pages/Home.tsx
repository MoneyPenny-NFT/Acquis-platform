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

  const unitLabel = merchant.tokenId ? 'tokens' : 'units';

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-6 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white leading-tight">{merchant.name}</h1>
          <p className="text-xs text-pos-muted mt-0.5">{merchant.tagline}</p>
          {merchant.location && (
            <p className="text-xs text-pos-muted/70 mt-0.5">{merchant.location}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 pt-1">
          <span className="text-[10px] text-pos-muted tracking-widest uppercase">network</span>
          <span className="text-xs font-bold text-pos-accent">HEDERA</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-pos-border mx-5" />

      {/* Catalog grid */}
      <div className="px-4 pt-4">
        <p className="text-[10px] text-pos-muted tracking-widest uppercase mb-3 px-1">Catalog</p>
        <div className="grid grid-cols-3 gap-2.5">
          {catalog.map(item => (
            <ItemButton key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* Custom amount */}
      <div className="px-4 pt-4">
        <button
          onClick={openNumpad}
          className="w-full py-3 rounded-2xl border border-dashed border-pos-border text-pos-muted
                     text-sm font-medium hover:border-pos-accent hover:text-pos-accent transition-colors"
        >
          {customAmount > 0
            ? `Custom: ${customAmount} ${unitLabel} (tap to change)`
            : '+ Enter custom amount'}
        </button>
      </div>

      {/* Cart banner */}
      {cartCount > 0 && (
        <div className="fixed bottom-16 inset-x-0 z-30 px-4 pb-2 max-w-sm mx-auto">
          <button
            onClick={() => navigate('/cart')}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl
                       bg-pos-accent text-pos-bg font-bold shadow-lg shadow-pos-accent/20
                       active:scale-[0.98] transition-transform"
          >
            <span className="flex items-center gap-2">
              <span className="bg-pos-bg/20 rounded-lg w-6 h-6 flex items-center justify-center text-xs font-bold">
                {cartCount}
              </span>
              <span className="text-sm">item{cartCount !== 1 ? 's' : ''}</span>
            </span>
            <span className="text-sm font-bold">
              {cartSubtotal.toFixed(2)} {unitLabel}  →
            </span>
          </button>
        </div>
      )}

      <BottomNav />

      {/* Custom amount modal */}
      {showNumpad && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end"
          onClick={e => { if (e.target === e.currentTarget) setShowNumpad(false); }}
        >
          <div className="w-full max-w-sm mx-auto bg-pos-surface rounded-t-3xl p-5 space-y-4 animate-slide-up border-t border-pos-border">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold tracking-widest uppercase text-pos-dim">Custom Amount</p>
              <button onClick={() => setShowNumpad(false)} className="text-pos-muted hover:text-white text-xl w-8 h-8 flex items-center justify-center">
                ×
              </button>
            </div>

            <div className="bg-pos-card rounded-2xl p-5 text-center border border-pos-border">
              <p className="text-xs text-pos-muted tracking-widest mb-2 uppercase">Amount</p>
              <p className="text-5xl font-bold text-pos-accent tabular-nums">
                {amountStr === '' ? '0' : amountStr}
              </p>
              <p className="text-sm text-pos-muted mt-2">{unitLabel}</p>
            </div>

            <NumPad value={amountStr} onChange={setAmountStr} />

            <button
              onClick={applyCustom}
              disabled={!amountStr || parseFloat(amountStr) <= 0}
              className="w-full py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-base
                         disabled:opacity-30 active:scale-95 transition-transform"
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
