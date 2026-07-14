import { useState } from 'react';
import { BottomNav } from '../components/BottomNav';
import { NumPad }    from '../components/NumPad';
import { useApi }    from '../hooks/useApi';
import { api }       from '../api/client';

const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID ?? 'merchant-1';

type WalletBalance = Awaited<ReturnType<typeof api.wallet.getBalance>>;
type Redemption    = Awaited<ReturnType<typeof api.wallet.redeem>>;

interface ActiveCustomer {
  acquisId:    string;
  displayName: string | null;
  contact:     string;
}

function fmtAqt(units: number): string {
  return (units / 100).toFixed(2) + ' AQT';
}

function fmtCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function fmtEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
         ' · ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Wallet() {
  const [phone,     setPhone]     = useState('');
  const [customer,  setCustomer]  = useState<ActiveCustomer | null>(null);
  const [balance,   setBalance]   = useState<WalletBalance | null>(null);
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemStr, setRedeemStr] = useState('');
  const [redemption, setRedemption] = useState<Redemption | null>(null);

  const lookupOp = useApi<{ acquisId: string; displayName: string | null }>();
  const redeemOp = useApi<Redemption>();

  async function findMe() {
    if (!phone.trim()) return;
    setRedemption(null);
    const found = await lookupOp.execute(() => api.wallet.lookupByPhone(phone.trim()));
    if (!found) { setCustomer(null); setBalance(null); return; }

    setCustomer({ acquisId: found.acquisId, displayName: found.displayName, contact: phone.trim() });
    const bal = await api.wallet.getBalance(found.acquisId).catch(() => null);
    if (bal) setBalance(bal);
  }

  async function refreshBalance() {
    if (!customer) return;
    const bal = await api.wallet.getBalance(customer.acquisId).catch(() => null);
    if (bal) setBalance(bal);
  }

  function signOut() {
    setCustomer(null);
    setBalance(null);
    setRedemption(null);
    setPhone('');
  }

  function openRedeem() {
    setRedeemStr('');
    setShowRedeem(true);
  }

  async function confirmRedeem() {
    if (!customer) return;
    const displayValue = parseFloat(redeemStr);
    if (isNaN(displayValue) || displayValue <= 0) return;
    const redeemUnits = Math.round(displayValue * 100); // AQT to hundredths
    const result = await redeemOp.execute(() =>
      api.wallet.redeem(customer.acquisId, MERCHANT_ID, redeemUnits),
    );
    if (result) {
      setRedemption(result);
      setShowRedeem(false);
      refreshBalance();
    }
  }

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-pos-accent/70 uppercase tracking-widest">Rewards</p>
          <h1 className="text-lg font-bold tracking-wide text-pos-text">My Wallet</h1>
        </div>
        {customer && (
          <button onClick={signOut}
            className="text-xs text-pos-muted hover:text-pos-accent transition-colors">
            Sign out
          </button>
        )}
      </div>
      <div className="h-px bg-pos-border mx-5" />

      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-none space-y-4">

        {/* Intro: phone entry */}
        {!customer && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-pos-card rounded-2xl border border-pos-border p-5 shadow-card space-y-3">
              <p className="text-[10px] text-pos-muted tracking-widest uppercase">Phone number</p>
              <input
                type="tel"
                inputMode="tel"
                placeholder="+15555550100"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') findMe(); }}
                className="w-full bg-pos-surface rounded-xl border border-pos-border px-3 py-3
                           text-base font-mono text-pos-text outline-none
                           focus:border-pos-accent transition-colors"
              />
              <button
                onClick={findMe}
                disabled={!phone.trim() || lookupOp.loading}
                className="w-full py-3 rounded-xl bg-pos-accent text-pos-bg font-bold text-sm
                           shadow-teal-glow disabled:opacity-30 disabled:cursor-not-allowed
                           active:scale-[0.98] transition-all"
              >
                {lookupOp.loading ? 'Looking up…' : 'View my rewards'}
              </button>
              {lookupOp.error && (
                <p className="text-xs text-pos-error text-center">
                  {lookupOp.error.match(/not found/i)
                    ? 'No rewards account found for that phone. Ask the merchant to enroll you.'
                    : lookupOp.error}
                </p>
              )}
            </div>
            <p className="text-[10px] text-pos-muted text-center px-4 leading-relaxed">
              Enter the phone number the merchant used to enroll you.
              Balances and redemption codes are stored on Hedera Consensus Service.
            </p>
          </div>
        )}

        {/* Wallet: balance + actions */}
        {customer && balance && (
          <div className="space-y-4 animate-fade-in">
            {/* Balance hero */}
            <div className="bg-gradient-to-br from-pos-accent/15 to-pos-card border border-pos-accent/30
                            rounded-2xl p-5 shadow-teal-glow">
              <p className="text-[10px] text-pos-accent/80 tracking-widest uppercase mb-1">
                {customer.displayName ?? 'Rewards balance'}
              </p>
              <p className="text-4xl font-black text-pos-accent tabular-nums tracking-tight">
                {balance.balanceDisplay}
              </p>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-pos-muted">
                <span className="font-mono truncate">{customer.acquisId}</span>
                <span>·</span>
                <span className="uppercase tracking-wide">{balance.tier}</span>
              </div>
            </div>

            {/* Redeem CTA */}
            <button
              onClick={openRedeem}
              disabled={balance.aqsBalance <= 0}
              className="w-full py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-base
                         shadow-teal-glow disabled:opacity-30 disabled:cursor-not-allowed
                         active:scale-[0.98] transition-all"
            >
              {balance.aqsBalance <= 0 ? 'No balance to redeem yet' : 'Redeem rewards'}
            </button>

            {/* Active redemption code */}
            {redemption && (
              <div className="bg-pos-card border-2 border-pos-accent rounded-2xl p-5 shadow-teal-glow space-y-3">
                <div className="text-center space-y-1">
                  <p className="text-[10px] text-pos-accent tracking-widest uppercase">Show this code to the merchant</p>
                  <p className="text-4xl font-black font-mono text-pos-accent tracking-[0.4em] py-2">
                    {redemption.code}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-[9px] text-pos-muted tracking-widest uppercase">Redeeming</p>
                    <p className="text-sm font-bold text-pos-text">{redemption.redeemDisplay}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-pos-muted tracking-widest uppercase">Value</p>
                    <p className="text-sm font-bold text-pos-text">{fmtCents(redemption.valueCents)}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-pos-border/50 flex items-center justify-between text-[10px]">
                  <span className="text-pos-muted">
                    Expires {new Date(redemption.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  {redemption.hcsSequenceNumber !== null && (
                    <span className="text-blue-400 font-mono">HCS #{redemption.hcsSequenceNumber}</span>
                  )}
                </div>
              </div>
            )}

            {/* Recent activity */}
            <section>
              <p className="text-[10px] text-pos-muted tracking-widest uppercase mb-2 px-1">Recent activity</p>
              <div className="bg-pos-card rounded-2xl border border-pos-border divide-y divide-pos-border">
                {balance.recentEvents.length === 0 && (
                  <p className="text-xs text-pos-muted text-center py-6">No reward activity yet.</p>
                )}
                {balance.recentEvents.slice(0, 10).map(ev => (
                  <div key={ev.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-pos-text capitalize">{ev.eventType.replace('_', ' ')}</p>
                      <p className="text-[10px] text-pos-muted">{fmtEventDate(ev.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold tabular-nums ${ev.status === 'zero_guard' ? 'text-pos-muted' : 'text-pos-accent'}`}>
                        +{fmtAqt(ev.rewardUnits)}
                      </p>
                      {ev.hcsSequenceNumber && (
                        <p className="text-[9px] text-blue-400 font-mono">HCS #{ev.hcsSequenceNumber}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {redeemOp.error && (
          <p className="text-xs text-pos-error text-center">{redeemOp.error}</p>
        )}
      </div>

      <BottomNav />

      {/* Redeem modal */}
      {showRedeem && balance && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end"
          onClick={e => { if (e.target === e.currentTarget) setShowRedeem(false); }}
        >
          <div className="w-full max-w-sm mx-auto bg-pos-surface rounded-t-3xl p-5 space-y-4
                          animate-slide-up border-t border-pos-border shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold tracking-widest uppercase text-pos-dim">Redeem AQT</p>
              <button onClick={() => setShowRedeem(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-pos-muted
                           hover:text-pos-text hover:bg-pos-border/50 text-xl transition-colors">
                ×
              </button>
            </div>

            <div className="bg-pos-card rounded-2xl p-5 text-center border border-pos-border shadow-card">
              <p className="text-[10px] font-semibold text-pos-muted tracking-widest mb-3 uppercase">
                Amount (AQT)
              </p>
              <p className="text-5xl font-black text-pos-accent tabular-nums tracking-tight">
                {redeemStr === '' ? '0.00' : redeemStr}
              </p>
              <p className="text-[10px] text-pos-muted mt-2">
                Available: {balance.balanceDisplay}
              </p>
            </div>

            <NumPad value={redeemStr} onChange={setRedeemStr} />

            <button
              onClick={confirmRedeem}
              disabled={
                redeemOp.loading ||
                !redeemStr ||
                parseFloat(redeemStr) <= 0 ||
                Math.round(parseFloat(redeemStr) * 100) > balance.aqsBalance
              }
              className="w-full py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-base
                         shadow-teal-glow disabled:opacity-30 disabled:cursor-not-allowed
                         active:scale-[0.98] transition-all duration-150"
            >
              {redeemOp.loading
                ? 'Generating code…'
                : Math.round(parseFloat(redeemStr || '0') * 100) > balance.aqsBalance
                  ? 'Exceeds balance'
                  : 'Get redemption code'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
