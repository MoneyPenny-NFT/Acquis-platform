interface Props {
  type: 'success' | 'error';
  message: string;
}

export function Alert({ type, message }: Props) {
  const styles = type === 'success'
    ? 'bg-green-50 border-green-200 text-green-800'
    : 'bg-red-50 border-red-200 text-red-800';
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {message}
    </div>
  );
}
