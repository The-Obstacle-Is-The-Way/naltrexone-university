import { cn } from '@/lib/utils';
import {
  tabSwitchContainerClasses,
  tabSwitchItemActiveClasses,
  tabSwitchItemBaseClasses,
  tabSwitchItemInactiveClasses,
} from './tab-switch-styles';

export type SegmentedControlOption = {
  value: string;
  label: string;
};

export type SegmentedControlProps = {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  legend?: string;
  ariaLabelledBy?: string;
};

export function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
  legend,
  ariaLabelledBy,
}: SegmentedControlProps) {
  return (
    <fieldset
      className={tabSwitchContainerClasses}
      aria-labelledby={ariaLabelledBy}
    >
      {legend && !ariaLabelledBy ? (
        <legend className="sr-only">{legend}</legend>
      ) : null}
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
              tabSwitchItemBaseClasses,
              'disabled:pointer-events-none disabled:opacity-50',
              isActive
                ? tabSwitchItemActiveClasses
                : tabSwitchItemInactiveClasses,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
