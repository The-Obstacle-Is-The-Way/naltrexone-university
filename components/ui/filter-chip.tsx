import { cn } from '@/lib/utils';

export type FilterChipProps = {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
};

export function FilterChip({
  label,
  selected,
  onClick,
  disabled,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {label}
    </button>
  );
}
