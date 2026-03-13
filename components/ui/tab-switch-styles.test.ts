import { describe, expect, it } from 'vitest';

import { compactControlShellClasses } from './control-shell-styles';
import {
  tabSwitchContainerClasses,
  tabSwitchItemActiveClasses,
  tabSwitchItemBaseClasses,
  tabSwitchItemInactiveClasses,
} from './tab-switch-styles';

describe('tab-switch-styles', () => {
  it('defines the canonical container classes', () => {
    expect(compactControlShellClasses).toBe(
      'inline-flex rounded-lg border border-border bg-muted p-1',
    );
    expect(tabSwitchContainerClasses).toBe(compactControlShellClasses);
    expect(compactControlShellClasses).not.toContain(
      'dark:border-foreground/40',
    );
    expect(compactControlShellClasses).not.toContain('rounded-full');
    expect(compactControlShellClasses).not.toContain('bg-muted/20');
    expect(compactControlShellClasses).not.toContain('border-border/60');
    expect(compactControlShellClasses).not.toContain('gap-');
    expect(compactControlShellClasses).not.toContain('items-');
  });

  it('defines the canonical active classes', () => {
    expect(tabSwitchItemActiveClasses).toContain('bg-primary');
    expect(tabSwitchItemActiveClasses).toContain('text-primary-foreground');
    expect(tabSwitchItemActiveClasses).toContain('shadow-sm');
    expect(tabSwitchItemActiveClasses).not.toContain('bg-background');
  });

  it('defines the canonical base classes', () => {
    expect(tabSwitchItemBaseClasses).toContain('rounded-md');
    expect(tabSwitchItemBaseClasses).toContain('focus-visible');
    expect(tabSwitchItemBaseClasses).toContain('py-2');
  });

  it('defines the canonical inactive classes', () => {
    expect(tabSwitchItemInactiveClasses).toContain('text-muted-foreground');
    expect(tabSwitchItemInactiveClasses).toContain('hover:bg-muted/50');
    expect(tabSwitchItemInactiveClasses).toContain('hover:text-foreground');
  });
});
