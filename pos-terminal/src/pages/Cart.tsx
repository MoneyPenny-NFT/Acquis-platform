import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession }  from '../context/SessionContext';
import { CartItemRow } from '../components/CartItemRow';
import { TipSelector } from '../components/TipSelector';
import { BottomNav }   from '../components/BottomNav';
import { StatusBadge } from '../components/StatusBadge';
import { useApi }      from '../hooks/useApi';
import { api }         from '../api/client';
import type { PaymentMode, Receipt, XrpProof, HcsProof, AqsReward } from '../context/SessionContext';

export function Cart() {
  const navigate = useNavigate();
  const {
    merchant, cart, customAmount, setCustomAmount,
    clearCart, cartSubtotal, addReceipt, tokenId,
  } = useSession();

  const [customerId,  setCustomerId]  = useState('');
  const [customerXrplAddress, setCustomerXrplAddress] = useState('');
  const [mode,        setMode]        = useState<PaymentMode>('token');
  const [tipAmount,   setTipAmount]   = useState(0);
  const [linkedAccts, setLinkedAccts] = useState<Array<{ id: string; institutionName: string; accountMask: string }>>([]);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError,   setBankError]   = useState<string | null>(null);
  const op = useApi<unknown>();

  const taxAmount = parseFloat((cartSubtotal * merchant.taxRatePct / 100).toFixed(2));
  const total     = parseFloat((cartSubtotal + taxAmount + tipAmount).toFixed(2));
  const isEmpty   = cart.length === 0 && customAmount <= 0;

  async function loadBankAccounts() {
    if (!customerId.trim()) { setBankError('Enter customer Hedera ID first'); return; }
    setBankLoading(true);
    setBankError(null);
    try {
      const res = await api.bankLink.list(customerId.trim());
      setLinkedAccts(res.accounts);
      if (res.accounts.length === 0) setBankError('No linked accounts. Customer must link a bank first.');
    } catch (e) {
      setBankError(e instanceof Error ? e.message : 'Failed to load bank accounts');
    } finally {
      setBankLoading(false);
    }
  }

  async function charge() {
    if (isEmpty) return;
    if (mode !== 'xrp' && mode !== 'x402' && !customerId.trim()) return;

    let receipt: Receipt;

    if (mode === 'bank') {
      if (!selectedBank) { op.reset(); return; }
      const result = await op.execute(() =>
        api.fund(selectedBank, customerId.trim(), Math.round(total * 100)),
      ) as { fundingRequestId: string; status: string } | null;
      if (!result) return;
      receipt = buildReceipt('bank', 'processing');
    } else if (mode === 'xrp') {
      const amountCents = Math.round(total * 100);
      const combined = await op.execute(async () => {
        const pay = await api.payXrp(amountCents, customerXrplAddress.trim() || undefined);
        if (!pay.success) throw new Error('XRP payment failed');
        const rewardUnits = Math.floor(amountCents * 100 / 10000);
        const aqs: AqsReward | undefined = rewardUnits > 0
          ? { rewardUnits, rewardDisplay: (rewardUnits / 100).toFixed(2) + ' AQT' }
          : undefined;
        let hcs: HcsProof | undefined;
        try {
          const h = await api.hcsWrite('0.0.9342744', JSON.stringify({
            type: 'xrp_payment', txHash: pay.txHash, amountCents, rewardUnits,
            timestamp: new Date().toISOString(),
          }));
          hcs = { topicId: h.topic_id, sequenceNumber: h.sequence_number,
            consensusTimestamp: h.consensus_timestamp, transactionId: h.transaction_id };
        } catch {}
        return { pay, aqs, hcs };
      }) as { pay: { txHash: string; destinationTag: number; ledgerIndex?: number; fee?: string }; aqs?: AqsReward; hcs?: HcsProof } | null;
      if (!combined) return;
      receipt = buildReceipt('xrp', 'settled', {
        txHash: combined.pay.txHash,
        destinationTag: combined.pay.destinationTag,
        ledgerIndex: combined.pay.ledgerIndex,
        fee: combined.pay.fee,
      }, combined.hcs, combined.aqs);
    } else if (mode === 'x402') {
      const amountCents = Math.round(total * 100);
      const combined = await op.execute(async () => {
        const pay = await api.payX402(amountCents, customerXrplAddress.trim() || undefined);
        if (!pay.success) throw new Error('x402 payment failed');
        const rewardUnits = Math.floor(amountCents * 100 / 10000);
        const aqs: AqsReward | undefined = rewardUnits > 0
          ? { rewardUnits, rewardDisplay: (rewardUnits / 100).toFixed(2) + ' AQT' }
          : undefined;
        let hcs: HcsProof | undefined;
        try {
          const h = await api.hcsWrite('0.0.9342744', JSON.stringify({
            type: 'x402_payment', txHash: pay.txHash, amountCents, rewardUnits,
            timestamp: new Date().toISOString(),
          }));
          hcs = { topicId: h.topic_id, sequenceNumber: h.sequence_number,
            consensusTimestamp: h.consensus_timestamp, transactionId: h.transaction_id };
        } catch {}
        return { pay, aqs, hcs };
      }) as { pay: { txHash: string; destinationTag: number; ledgerIndex?: number; fee?: string }; aqs?: AqsReward; hcs?: HcsProof } | null;
      if (!combined) return;
      receipt = buildReceipt('x402', 'settled', {
        txHash: combined.pay.txHash,
        destinationTag: combined.pay.destinationTag,
        ledgerIndex: combined.pay.ledgerIndex,
        fee: combined.pay.fee,
      }, combined.hcs, combined.aqs);
    } else {
      const amountCents = Math.round(total * 100);
      const combined = await op.execute(async () => {
        const result = await api.pay(customerId.trim(), total, mode, mode === 'token' ? (tokenId || undefined) : undefined, customerXrplAddress.trim() || undefined);
        if (!result.success) throw new Error('Payment failed');
        let hcs: HcsProof | undefined;
        try {
          const h = await api.hcsWrite('0.0.9342744', JSON.stringify({
            type: 'payment_rules_confirmed', mode, amountCents,
            customerId: customerId.trim(), timestamp: new Date().toISOString(),
          }));
          hcs = { topicId: h.topic_id, sequenceNumber: h.sequence_number,
            consensusTimestamp: h.consensus_timestamp, transactionId: h.transaction_id };
        } catch {}
        return { hcs };
      }) as { hcs?: HcsProof } | null;
      if (!combined) return;
      receipt = buildReceipt(mode, 'settled', undefined, combined.hcs);
    }

    addReceipt(receipt);
    clearCart();
    navigate('/receipt', { state: { receipt } });
  }

  function buildReceipt(m: PaymentMode, status: 'settled' | 'processing', xrp?: XrpProof, hcs?: HcsProof, aqs?: AqsReward): Receipt {
    return {
      id:          String(Date.now()),
      mode:        m,
      tokenId:     m === 'token' ? tokenId || undefined : undefined,
      toId:        customerId.trim(),
      items:       [...cart],
      customAmount,
      subtotal:    cartSubtotal,
      taxAmount,
      tipAmount,
      total,
      timestamp:   new Date().toISOString(),
      merchantName: merchant.name,
      status,
      xrp,
      hcs,
      aqs,
    };
  }

  const unitLabel = 'USD';

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={() => navigate('/')}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-pos-muted
                           hover:text-pos-text hover:bg-pos-border/50 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 className="text-base font-bold tracking-widest uppercase text-pos-text">Order</h1>
      </div>
      <div className="h-px bg-pos-border mx-5" />

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scrollbar-none">

        {/* Items */}
        {(cart.length > 0 || customAmount > 0) && (
          <section>
            <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-2">Items</p>
            <div className="bg-pos-card rounded-2xl border border-pos-border px-4 divide-y divide-pos-border shadow-card">
              {cart.map(item => <CartItemRow key={item.id} item={item} />)}
              {customAmount > 0 && (
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl w-8 text-center">✏️</span>
                    <div>
                      <p className="text-sm font-medium text-pos-text">Custom amount</p>
                      <p className="text-xs text-pos-muted">${customAmount.toFixed(2)} {unitLabel}</p>
                    </div>
                  </div>
                  <button onClick={() => setCustomAmount(0)}
                          className="text-pos-error/60 hover:text-pos-error text-xl transition-colors">×</button>
                </div>
              )}
            </div>
          </section>
        )}

        {isEmpty && (
          <div className="text-center py-16 text-pos-muted text-sm">
            Cart is empty — add items from the menu
          </div>
        )}

        {/* Tip */}
        {!isEmpty && (
          <section>
            <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-2">Tip</p>
            <TipSelector subtotal={cartSubtotal} tipAmount={tipAmount} onChangeTip={setTipAmount} />
          </section>
        )}

        {/* Summary */}
        {!isEmpty && (
          <section className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-2.5 shadow-card">
            <Line label="Subtotal"                       value={`$${cartSubtotal.toFixed(2)}`} />
            <Line label={`Tax (${merchant.taxRatePct}%)`} value={`$${taxAmount.toFixed(2)}`} />
            {tipAmount > 0 && <Line label="Tip"          value={`$${tipAmount.toFixed(2)}`} />}
            <div className="h-px bg-pos-border my-1" />
            <Line label="Total" value={`$${total.toFixed(2)} ${unitLabel}`} bold accent />
          </section>
        )}

        {/* Customer */}
        {mode !== 'xrp' && mode !== 'x402' && (
          <section>
            <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-2">
              Customer Hedera Account
            </p>
            <div className="bg-pos-card rounded-2xl border border-pos-border px-4 py-3 shadow-card">
              <input
                className="w-full bg-transparent text-pos-text text-sm font-mono outline-none
                           placeholder-pos-muted/50"
                placeholder="0.0.XXXXX"
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
              />
            </div>
          </section>
        )}

        {/* Customer XRPL Address — optional. When provided AND the server has
            CREDENTIAL_VERIFICATION_ENABLED=true, the payment is gated on the
            address holding a valid AcquisMember credential. */}
        <section>
          <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-2">
            Customer XRPL Address <span className="text-pos-muted/60">(optional — enables credential check)</span>
          </p>
          <div className="bg-pos-card rounded-2xl border border-pos-border px-4 py-3 shadow-card">
            <input
              className="w-full bg-transparent text-pos-text text-sm font-mono outline-none
                         placeholder-pos-muted/50"
              placeholder="rXXXXXXXXXXXXXXXXXXXXXXXX"
              value={customerXrplAddress}
              onChange={e => setCustomerXrplAddress(e.target.value)}
            />
          </div>
        </section>

        {/* Payment method */}
        <section>
          <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-2">
            Payment Method
          </p>
          <div className="flex gap-1.5 bg-pos-card rounded-2xl p-1.5 border border-pos-border shadow-card">
            {(['xrp', 'x402', 'token', 'hbar', 'bank'] as PaymentMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-95 ${
                  mode === m
                    ? 'bg-pos-accent text-pos-bg shadow-teal-glow'
                    : 'text-pos-muted hover:text-pos-dim'
                }`}
              >
                {m === 'token' ? 'TOKEN' : m === 'hbar' ? 'HBAR' : m === 'bank' ? 'BANK' : m === 'xrp' ? 'XRP' : 'X402'}
              </button>
            ))}
          </div>
          {mode === 'xrp' && (
            <p className="text-[10px] text-pos-muted mt-2 px-1">
              Pays via XRP Ledger testnet — no customer account needed.
            </p>
          )}
          {mode === 'x402' && (
            <p className="text-[10px] text-pos-muted mt-2 px-1">
              Pays via x402 protocol over XRP Ledger testnet — no customer account needed.
            </p>
          )}
        </section>

        {/* Bank accounts */}
        {mode === 'bank' && (
          <section className="animate-slide-up">
            <p className="text-[10px] font-semibold text-pos-muted tracking-widest uppercase mb-2">
              Linked Bank Account
            </p>
            <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-3 shadow-card">
              {linkedAccts.length === 0 && (
                <button
                  onClick={loadBankAccounts}
                  disabled={bankLoading}
                  className="w-full py-3 rounded-xl border border-dashed border-pos-border text-pos-muted
                             text-sm hover:border-pos-accent/50 hover:text-pos-accent transition-all
                             disabled:opacity-50"
                >
                  {bankLoading ? 'Loading…' : 'Load linked accounts'}
                </button>
              )}
              {bankError && <p className="text-xs text-pos-error">{bankError}</p>}
              {linkedAccts.map(acct => (
                <button
                  key={acct.id}
                  onClick={() => setSelectedBank(acct.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                    selectedBank === acct.id
                      ? 'border-pos-accent bg-pos-accent/10'
                      : 'border-pos-border hover:border-pos-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🏦</span>
                    <div className="text-left">
                      <p className="text-sm font-medium text-pos-text">{acct.institutionName}</p>
                      <p className="text-xs text-pos-muted">···· {acct.accountMask}</p>
                    </div>
                  </div>
                  {selectedBank === acct.id && (
                    <span className="text-pos-accent font-bold text-lg">✓</span>
                  )}
                </button>
              ))}
              {linkedAccts.length > 0 && (
                <button
                  onClick={() => navigate('/bank-link', { state: { customerId } })}
                  className="w-full text-xs text-pos-muted hover:text-pos-accent transition-colors py-1"
                >
                  + Link another account
                </button>
              )}
            </div>
            <p className="text-[10px] text-pos-muted mt-2 px-1">
              ACH transfers settle in 2–3 business days.
            </p>
          </section>
        )}

        {/* Status */}
        <StatusBadge
          status={op.loading ? 'loading' : op.error ? 'error' : 'idle'}
          message={op.loading ? 'Processing payment…' : op.error ?? undefined}
        />
      </div>

      {/* Charge button */}
      <div className="fixed bottom-16 inset-x-0 px-4 pb-3 max-w-sm mx-auto z-30">
        <button
          onClick={charge}
          disabled={op.loading || isEmpty || (mode !== 'xrp' && mode !== 'x402' && !customerId.trim()) || (mode === 'bank' && !selectedBank)}
          className="w-full py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-base
                     shadow-teal-glow disabled:opacity-30 disabled:cursor-not-allowed
                     active:scale-[0.98] transition-all duration-150"
        >
          {op.loading ? 'Processing…' : `Charge $${total.toFixed(2)}`}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

function Line({
  label, value, bold, accent,
}: {
  label: string; value: string; bold?: boolean; accent?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-sm text-pos-muted">{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : ''} ${accent ? 'text-pos-accent' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}
