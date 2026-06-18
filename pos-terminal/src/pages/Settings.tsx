import { useState } from 'react';
import { useSession } from '../context/SessionContext';
import { BottomNav } from '../components/BottomNav';
import type { CatalogItem, MerchantConfig } from '../context/SessionContext';

type EditingItem = Omit<CatalogItem, 'id'> & { id: string | null };

const EMOJI_OPTIONS = ['☕','🥪','🥤','🍪','🍱','🧃','🍕','🍔','🌮','🍜','🍣','🥗','🧁','🍰','🎂','🎁','💳','📦','⭐','🏷️'];

export function Settings() {
  const { merchant, setMerchant, catalog, setCatalog } = useSession();

  const [tab, setTab]           = useState<'merchant' | 'catalog'>('merchant');
  const [draft, setDraft]       = useState<MerchantConfig>(merchant);
  const [saved, setSaved]       = useState(false);
  const [editItem, setEditItem] = useState<EditingItem | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  function saveMerchant() {
    setMerchant(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function openNewItem() {
    setEditItem({ id: null, name: '', price: 0, emoji: '⭐' });
    setShowEmoji(false);
  }

  function openEditItem(item: CatalogItem) {
    setEditItem({ ...item });
    setShowEmoji(false);
  }

  function saveItem() {
    if (!editItem || !editItem.name.trim() || editItem.price <= 0) return;
    if (editItem.id === null) {
      setCatalog([...catalog, { ...editItem, id: String(Date.now()) }]);
    } else {
      setCatalog(catalog.map(c => c.id === editItem.id ? { ...editItem, id: editItem.id! } : c));
    }
    setEditItem(null);
  }

  function deleteItem(id: string) {
    setCatalog(catalog.filter(c => c.id !== id));
  }

  function moveItem(id: string, dir: -1 | 1) {
    const idx = catalog.findIndex(c => c.id === id);
    if (idx < 0) return;
    const next = [...catalog];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setCatalog(next);
  }

  return (
    <div className="min-h-screen flex flex-col pb-32 max-w-sm mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-lg font-bold tracking-widest uppercase">Settings</h1>
      </div>
      <div className="h-px bg-pos-border mx-5" />

      {/* Tab bar */}
      <div className="flex gap-0 mx-5 mt-4 bg-pos-card rounded-2xl p-1 border border-pos-border">
        {(['merchant', 'catalog'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t
                ? 'bg-pos-accent text-pos-bg shadow-sm'
                : 'text-pos-muted hover:text-pos-dim'
            }`}
          >
            {t === 'merchant' ? 'Merchant' : 'Catalog'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none">

        {/* Merchant tab */}
        {tab === 'merchant' && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-pos-card rounded-2xl border border-pos-border p-4 space-y-4">

              <Field
                label="Store Name"
                value={draft.name}
                placeholder="My Store"
                onChange={v => setDraft(d => ({ ...d, name: v }))}
              />

              <Field
                label="Tagline"
                value={draft.tagline}
                placeholder="Powered by Hedera"
                onChange={v => setDraft(d => ({ ...d, tagline: v }))}
              />

              <Field
                label="Location (optional)"
                value={draft.location}
                placeholder="123 Main St, City"
                onChange={v => setDraft(d => ({ ...d, location: v }))}
              />

              <div className="h-px bg-pos-border" />

              <Field
                label="Default Token ID"
                value={draft.tokenId}
                placeholder="0.0.XXXXX"
                mono
                onChange={v => setDraft(d => ({ ...d, tokenId: v }))}
              />

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-pos-muted tracking-widest uppercase">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={draft.taxRatePct}
                  onChange={e => setDraft(d => ({ ...d, taxRatePct: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-pos-surface rounded-xl border border-pos-border px-3 py-2.5
                             text-sm text-white outline-none focus:border-pos-accent transition-colors"
                />
                <p className="text-[10px] text-pos-muted/60">Applied to subtotal at checkout</p>
              </div>
            </div>

            <p className="text-[10px] text-pos-muted px-1">
              Treasury signing is handled server-side — no private keys stored here.
            </p>
          </div>
        )}

        {/* Catalog tab */}
        {tab === 'catalog' && (
          <div className="space-y-3 animate-fade-in">
            {catalog.map((item, idx) => (
              <div
                key={item.id}
                className="bg-pos-card rounded-2xl border border-pos-border px-4 py-3
                           flex items-center gap-3"
              >
                <span className="text-2xl w-8 text-center select-none">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-pos-muted">{item.price} tokens</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveItem(item.id, -1)}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded-lg bg-pos-surface border border-pos-border text-pos-muted
                               flex items-center justify-center text-xs disabled:opacity-30 transition-opacity"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveItem(item.id, 1)}
                    disabled={idx === catalog.length - 1}
                    className="w-7 h-7 rounded-lg bg-pos-surface border border-pos-border text-pos-muted
                               flex items-center justify-center text-xs disabled:opacity-30 transition-opacity"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => openEditItem(item)}
                    className="w-7 h-7 rounded-lg bg-pos-surface border border-pos-border text-pos-dim
                               flex items-center justify-center text-xs hover:border-pos-accent
                               hover:text-pos-accent transition-colors"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="w-7 h-7 rounded-lg text-pos-error/50 hover:text-pos-error
                               flex items-center justify-center text-sm transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={openNewItem}
              className="w-full py-3 rounded-2xl border border-dashed border-pos-border text-pos-muted
                         text-sm hover:border-pos-accent hover:text-pos-accent transition-colors"
            >
              + Add item
            </button>
          </div>
        )}
      </div>

      {/* Save bar — merchant tab only */}
      {tab === 'merchant' && (
        <div className="fixed bottom-16 inset-x-0 px-4 pb-2 max-w-sm mx-auto z-30">
          <button
            onClick={saveMerchant}
            className={`w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]
              ${saved
                ? 'bg-pos-success/20 text-pos-success border border-pos-success/40'
                : 'bg-pos-accent text-pos-bg shadow-lg shadow-pos-accent/20'
              }`}
          >
            {saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      )}

      <BottomNav />

      {/* Edit / Add item modal */}
      {editItem && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end"
          onClick={e => { if (e.target === e.currentTarget) setEditItem(null); }}
        >
          <div className="w-full max-w-sm mx-auto bg-pos-surface rounded-t-3xl p-5 space-y-4
                          border-t border-pos-border animate-slide-up">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold tracking-widest uppercase">
                {editItem.id === null ? 'New Item' : 'Edit Item'}
              </p>
              <button onClick={() => setEditItem(null)} className="text-pos-muted hover:text-white text-xl w-8 h-8 flex items-center justify-center">
                ×
              </button>
            </div>

            {/* Emoji picker */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-pos-muted tracking-widest uppercase">Emoji</label>
              <button
                onClick={() => setShowEmoji(s => !s)}
                className="w-full bg-pos-card rounded-xl border border-pos-border px-4 py-3
                           text-2xl text-center hover:border-pos-accent transition-colors"
              >
                {editItem.emoji}
              </button>
              {showEmoji && (
                <div className="grid grid-cols-10 gap-1 bg-pos-card rounded-xl border border-pos-border p-3">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => { setEditItem(d => d ? { ...d, emoji: e } : d); setShowEmoji(false); }}
                      className={`text-xl p-1 rounded-lg transition-colors ${
                        editItem.emoji === e ? 'bg-pos-accent/20' : 'hover:bg-pos-surface'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-pos-muted tracking-widest uppercase">Name</label>
                <input
                  className="w-full bg-pos-card rounded-xl border border-pos-border px-3 py-2.5
                             text-sm text-white outline-none focus:border-pos-accent transition-colors"
                  placeholder="Item name"
                  value={editItem.name}
                  onChange={e => setEditItem(d => d ? { ...d, name: e.target.value } : d)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-pos-muted tracking-widest uppercase">Price (tokens)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="w-full bg-pos-card rounded-xl border border-pos-border px-3 py-2.5
                             text-sm text-white outline-none focus:border-pos-accent transition-colors"
                  value={editItem.price || ''}
                  onChange={e => setEditItem(d => d ? { ...d, price: parseFloat(e.target.value) || 0 } : d)}
                />
              </div>
            </div>

            <button
              onClick={saveItem}
              disabled={!editItem.name.trim() || editItem.price <= 0}
              className="w-full py-4 rounded-2xl bg-pos-accent text-pos-bg font-bold text-sm
                         disabled:opacity-30 active:scale-95 transition-transform"
            >
              {editItem.id === null ? 'Add to Catalog' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, placeholder, mono, onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-pos-muted tracking-widest uppercase">{label}</label>
      <input
        className={`w-full bg-pos-surface rounded-xl border border-pos-border px-3 py-2.5
                    text-sm text-white outline-none focus:border-pos-accent transition-colors
                    ${mono ? 'font-mono' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
