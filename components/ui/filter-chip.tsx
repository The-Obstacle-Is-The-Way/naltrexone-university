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
        'inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        'ring-focus',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
