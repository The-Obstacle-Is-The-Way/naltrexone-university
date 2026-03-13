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
        'inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        'outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12] hover:border-foreground/60 dark:border-foreground/40 dark:hover:border-foreground/70',
      )}
    >
      {label}
    </button>
  );
}
