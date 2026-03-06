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
        'outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-accent-foreground dark:border-foreground/40',
      )}
    >
      {label}
    </button>
  );
}
