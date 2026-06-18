import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { BottomNav } from '../components/BottomNav';

interface LinkedAccount {
  id: string;
  institutionName: string;
  accountMask: string;
  accountType: string;
  createdAt: string;
}

export function BankLink() {
  const navigate = useNavigate();
  const location  = useLocation() as { state?: { customerId?: string } };

  const [customerId, setCustomerId]   = useState(location.state?.customerId ?? '');
  const [accounts,   setAccounts]     = useState<LinkedAccount[]>([]);
  const [step,       setStep]         = useState<'accounts' | 'link' | 'confirm'>('accounts');
  const [publicToken, setPublicToken] = useState('');
  const [accountId,   setAccountId]   = useState('');
  const [unlinkId,    setUnlinkId]    = useState<string | null>(null);

  const listOp    = useApi<{ accounts: LinkedAccount[] }>();
  const linkOp    = useApi<{ linkToken: string }>();
  const exchangeOp = useApi<{ bankAccountId: string; institutionName: string; accountMask: string; accountType: string }>();
  const unlinkOp  = useApi<void>();

  async function loadAccounts() {
    if (!customerId.trim()) return;
    const res = await listOp.execute(() => api.bankLink.list(customerId.trim()));
    if (res) setAccounts(res.accounts);
  }

  useEffect(() => {
    if (customerId.trim()) loadAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLink() {
    if (!customerId.trim()) return;
    const res = await linkOp.execute(() => api.bankLink.createToken(customerId.trim()));
    if (res) {
      setStep('link');
    }
  }

  async function submitExchange() {
    if (!publicToken.trim() || !accountId.trim()) return;
    const res = await exchangeOp.execute(() =>
      api.bankLink.exchange(customerId.trim(), publicToken.trim(), accountId.trim()),
    );
    if (res) {
      await loadAccounts();
      setStep('accounts');
      setPublicToken('');
      setAccountId('');
    }
  }

  async function confirmUnlink() {
    if (!unlinkId) return;
    await unlinkOp.execute(() => api.bankLink.unlink(unlinkId, customerId.trim()));
    setUnlinkId(null);
    await loadAccounts();
  }

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-pos-muted hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 className="text-lg font-bold tracking-widest uppercase">Bank Accounts</h1>
      </div>
      <div className="h-px bg-pos-border mx-5" />

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scrollbar-none">

        {/* Customer ID input */}
        <section>
          <p className="text-[10px] text-pos-muted tracking-widest uppercase mb-2">Customer Hedera Account</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-pos-card rounded-2xl border border-pos-border px-4 py-3">
              <input
                className="w-full bg-transparent text-white text-sm font-mono outline-none placeholder-pos-muted"
                placeholder="0.0.XXXXX"
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
              />
            </div>
            <button
              onClick={loadAccounts}
              disabled={!customerId.trim() || listOp.loading}
              className="px-4 py-3 rounded-2xl bg-pos-card border border-pos-border text-pos-dim text-sm
                         hover:border-pos-accent hover:text-pos-accent transition-colors disabled:opacity-40"
            >
              {listOp.loading ? '…' : 'Load'}
            </button>
          </div>
          {listOp.error && <p className="text-xs text-pos-error mt-2 px-1">{listOp.error}</p>}
        </section>

        {/* Linked accounts list */}
        {step === 'accounts' && (
          <section className="space-y-3 animate-fade-in">
            <p className="text-[10px] text-pos-muted tracking-widest uppercase">Linked Accounts</p>

            {accounts.length === 0 && !listOp.loading && (
              <div className="bg-pos-card rounded-2xl border border-dashed border-pos-border p-6 text-center">
                <p className="text-sm text-pos-muted">No linked accounts</p>
                <p className="text-xs text-pos-muted/60 mt-1">Link a bank to enable ACH payments</p>
              </div>
            )}

            {accounts.map(acct => (
              <div
                key={acct.id}
                className="bg-pos-card rounded-2xl border border-pos-border p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏦</span>
                  <div>
                    <p className="text-sm font-medium">{acct.institutionName}</p>
                    <p className="text-xs text-pos-muted">···· {acct.accountMask} · {acct.accountType}</p>
                    <p className="text-[10px] text-pos-muted/60 mt-0.5">
                      Linked {new Date(acct.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUnlinkId(acct.id)}
                  className="text-pos-error/50 hover:text-pos-error text-xs transition-colors px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              onClick={startLink}
              disabled={!customerId.trim() || linkOp.loading}
              className="w-full py-3 rounded-2xl border border-dashed border-pos-border text-pos-muted
                         text-sm hover:border-pos-accent hover:text-pos-accent transition-colors
                         disabled:opacity-40"
            >
              {linkOp.loading ? 'Requesting link token…' : '+ Link new bank account'}
            </button>
            {linkOp.error && <p className="text-xs text-pos-error px-1">{linkOp.error}</p>}
          </section>
        )}

        {/* Plaid Link step — show link token + manual token entry */}
        {step === 'link' && (
          <section className="space-y-4 animate-slide-up">
            <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-2">
              <p className="text-xs text-pos-muted tracking-widest uppercase">Link Token (pass to Plaid Link)</p>
              <p className="text-xs font-mono text-pos-accent break-all select-all">
                {(linkOp.data as { linkToken: string } | null)?.linkToken}
              </p>
            </div>

            <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-3">
              <p className="text-xs text-pos-muted tracking-widest uppercase">After Plaid Link completes</p>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-pos-muted">Public Token</span>
                <input
                  className="w-full bg-pos-surface rounded-xl border border-pos-border px-3 py-2
                             text-sm font-mono text-white outline-none focus:border-pos-accent transition-colors"
                  placeholder="public-sandbox-…"
                  value={publicToken}
                  onChange={e => setPublicToken(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-pos-muted">Account ID</span>
                <input
                  className="w-full bg-pos-surface rounded-xl border border-pos-border px-3 py-2
                             text-sm font-mono text-white outline-none focus:border-pos-accent transition-colors"
                  placeholder="abc123…"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                />
              </label>
            </div>

            {exchangeOp.error && (
              <p className="text-xs text-pos-error px-1">{exchangeOp.error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('accounts'); setPublicToken(''); setAccountId(''); }}
                className="flex-1 py-3 rounded-2xl border border-pos-border text-pos-muted text-sm
                           hover:border-pos-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitExchange}
                disabled={!publicToken.trim() || !accountId.trim() || exchangeOp.loading}
                className="flex-1 py-3 rounded-2xl bg-pos-accent text-pos-bg text-sm font-bold
                           disabled:opacity-30 active:scale-95 transition-transform"
              >
                {exchangeOp.loading ? 'Linking…' : 'Confirm Link'}
              </button>
            </div>

            <p className="text-[10px] text-pos-muted text-center px-2">
              In production, Plaid Link opens automatically and returns the token to this app.
            </p>
          </section>
        )}

        {/* Info banner */}
        <div className="bg-pos-card/50 rounded-xl border border-pos-border/50 p-3 space-y-1">
          <p className="text-xs text-pos-dim font-medium">ACH Bank Transfers</p>
          <p className="text-[11px] text-pos-muted leading-relaxed">
            Linked accounts can be charged via ACH. Funds settle to the merchant's Hedera account
            in 2–3 business days after bank verification.
          </p>
        </div>
      </div>

      {/* Unlink confirmation modal */}
      {unlinkId && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end"
          onClick={e => { if (e.target === e.currentTarget) setUnlinkId(null); }}
        >
          <div className="w-full max-w-sm mx-auto bg-pos-surface rounded-t-3xl p-5 space-y-4
                          border-t border-pos-border animate-slide-up">
            <p className="text-sm font-bold text-center">Remove this bank account?</p>
            <p className="text-xs text-pos-muted text-center">
              The account will be unlinked and can no longer be used for payments.
            </p>
            {unlinkOp.error && <p className="text-xs text-pos-error text-center">{unlinkOp.error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setUnlinkId(null)}
                className="flex-1 py-3 rounded-2xl border border-pos-border text-pos-muted text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmUnlink}
                disabled={unlinkOp.loading}
                className="flex-1 py-3 rounded-2xl bg-pos-error text-white text-sm font-bold
                           disabled:opacity-50 active:scale-95 transition-transform"
              >
                {unlinkOp.loading ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
