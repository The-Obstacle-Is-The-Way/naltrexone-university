import { describe, expect, it } from 'vitest';

import {
  tabSwitchContainerClasses,
  tabSwitchItemActiveClasses,
  tabSwitchItemBaseClasses,
  tabSwitchItemInactiveClasses,
} from './tab-switch-styles';

describe('tab-switch-styles', () => {
  it('defines the canonical container classes', () => {
    expect(tabSwitchContainerClasses).toContain('rounded-lg');
    expect(tabSwitchContainerClasses).toContain('bg-muted');
    expect(tabSwitchContainerClasses).toContain('border-border');
    expect(tabSwitchContainerClasses).toBe(
      'inline-flex rounded-lg border border-border bg-muted p-1',
    );
    expect(tabSwitchContainerClasses).not.toContain('rounded-full');
    expect(tabSwitchContainerClasses).not.toContain('bg-muted/20');
    expect(tabSwitchContainerClasses).not.toContain('border-border/60');
    expect(tabSwitchContainerClasses).not.toContain('gap-');
    expect(tabSwitchContainerClasses).not.toContain('items-');
  });

  it('defines the canonical active classes', () => {
    expect(tabSwitchItemActiveClasses).toContain('bg-primary');
    expect(tabSwitchItemActiveClasses).toContain('text-primary-foreground');
    expect(tabSwitchItemActiveClasses).not.toContain('bg-background');
  });

  it('defines the canonical base and inactive classes', () => {
    expect(tabSwitchItemBaseClasses).toContain('rounded-md');
    expect(tabSwitchItemBaseClasses).toContain('focus-visible');
    expect(tabSwitchItemInactiveClasses).toContain('text-muted-foreground');
  });
});
