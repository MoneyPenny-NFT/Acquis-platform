interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FormField({ label, ...props }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}
