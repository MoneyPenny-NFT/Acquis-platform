interface Props {
  amount: string;
  label?: string;
  unit?: string;
}

export function AmountDisplay({ amount, label = 'AMOUNT', unit = 'TOKENS' }: Props) {
  const display = amount === '' ? '0' : amount;
  return (
    <div className="bg-pos-surface border border-pos-border rounded-2xl p-6 text-center">
      <p className="text-xs tracking-widest text-pos-muted mb-2">{label}</p>
      <p className="text-5xl font-bold text-pos-accent tabular-nums">{display}</p>
      <p className="text-sm text-pos-muted mt-2">{unit}</p>
    </div>
  );
}
