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
          : 'border-foreground/45 bg-transparent text-foreground/60 hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40',
      )}
    >
      {label}
    </button>
  );
}
