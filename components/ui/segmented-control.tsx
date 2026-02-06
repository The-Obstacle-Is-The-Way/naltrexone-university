import { cn } from '@/lib/utils';

export type SegmentedControlOption = {
  value: string;
  label: string;
};

export type SegmentedControlProps = {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
}: SegmentedControlProps) {
  return (
    <fieldset className="inline-flex rounded-lg border border-border bg-muted p-1">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-50',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
