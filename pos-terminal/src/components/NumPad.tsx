interface Props {
  value: string;
  onChange: (v: string) => void;
  maxLen?: number;
}

const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];

export function NumPad({ value, onChange, maxLen = 10 }: Props) {
  function press(k: string) {
    if (k === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === '.' && value.includes('.')) return;
    if (value.length >= maxLen) return;
    if (value === '0' && k !== '.') { onChange(k); return; }
    onChange(value + k);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map(k => (
        <button
          key={k}
          onClick={() => press(k)}
          className="h-16 rounded-xl bg-pos-surface border border-pos-border text-xl font-bold
                     text-white active:scale-95 transition-transform hover:bg-pos-border"
        >
          {k}
        </button>
      ))}
    </div>
  );
}
