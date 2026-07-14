interface Props {
  value: string;
  onChange: (v: string) => void;
  maxLen?: number;
}

const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];

export function NumPad({ value, onChange, maxLen = 10 }: Props) {
  function press(k: string) {
    if (k === '⌫') { onChange(value.slice(0, -1)); return; }
    if (k === '.' && value.includes('.')) return;
    if (value.length >= maxLen) return;
    if (value === '0' && k !== '.') { onChange(k); return; }
    onChange(value + k);
  }

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {KEYS.map(k => (
        <button
          key={k}
          onClick={() => press(k)}
          className={`h-[58px] rounded-2xl border text-lg font-semibold
                      transition-all duration-150 active:scale-95 select-none
                      ${k === '⌫'
                        ? 'bg-pos-surface border-pos-border text-pos-muted hover:text-pos-accent hover:border-pos-accent/40'
                        : 'bg-pos-surface border-pos-border text-pos-text hover:bg-pos-border/50 hover:border-pos-border'
                      }`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
