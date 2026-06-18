import { useState } from 'react';
import { NumPad } from './NumPad';

interface Props {
  subtotal: number;
  tipAmount: number;
  onChangeTip: (amount: number) => void;
}

const PRESETS = [
  { label: 'None', pct: 0 },
  { label: '15%',  pct: 15 },
  { label: '20%',  pct: 20 },
  { label: '25%',  pct: 25 },
];

export function TipSelector({ subtotal, tipAmount, onChangeTip }: Props) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [customStr, setCustomStr] = useState('');

  const activePct = PRESETS.find(p => Math.abs(p.pct / 100 * subtotal - tipAmount) < 0.01)?.pct ?? -1;

  function selectPreset(pct: number) {
    setMode('preset');
    setCustomStr('');
    onChangeTip(parseFloat((subtotal * pct / 100).toFixed(2)));
  }

  function applyCustom(str: string) {
    setCustomStr(str);
    const n = parseFloat(str);
    if (!isNaN(n) && n >= 0) onChangeTip(parseFloat(n.toFixed(2)));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {PRESETS.map(p => (
          <button
            key={p.pct}
            onClick={() => selectPreset(p.pct)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
              mode === 'preset' && activePct === p.pct
                ? 'bg-pos-accent text-pos-bg border-pos-accent'
                : 'bg-pos-card border-pos-border text-pos-dim hover:border-pos-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => { setMode('custom'); onChangeTip(0); }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
            mode === 'custom'
              ? 'bg-pos-accent text-pos-bg border-pos-accent'
              : 'bg-pos-card border-pos-border text-pos-dim hover:border-pos-muted'
          }`}
        >
          Custom
        </button>
      </div>

      {mode === 'custom' && (
        <div className="animate-slide-up space-y-2">
          <div className="bg-pos-surface rounded-xl p-3 text-center border border-pos-border">
            <p className="text-xs text-pos-muted mb-1">TIP AMOUNT</p>
            <p className="text-2xl font-bold text-pos-accent tabular-nums">
              {customStr === '' ? '0' : customStr}
            </p>
          </div>
          <NumPad value={customStr} onChange={applyCustom} />
        </div>
      )}
    </div>
  );
}
