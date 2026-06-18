interface Props {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
}

const styles = {
  idle: 'bg-pos-surface text-pos-muted border-pos-border',
  loading: 'bg-pos-surface text-pos-accent border-pos-accent animate-pulse',
  success: 'bg-green-900/30 text-pos-success border-green-700',
  error: 'bg-red-900/30 text-pos-error border-red-700',
};

export function StatusBadge({ status, message }: Props) {
  if (!message) return null;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm text-center ${styles[status]}`}>
      {message}
    </div>
  );
}
