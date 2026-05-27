import { compactControlShellClasses } from './control-shell-styles';

/**
 * Canonical visual class constants for tab-switch components.
 *
 * Consumed by SegmentedControl (button-based) and HistoryTabBar (link-based).
 * Semantic structure (element types, ARIA) stays in each component.
 * Visual styling is shared here to prevent drift.
 */

/** Outer container wrapping all tab items. */
export const tabSwitchContainerClasses = compactControlShellClasses;

/** Base classes for each tab item (active or inactive). */
export const tabSwitchItemBaseClasses =
  'rounded-md px-4 py-2 text-sm font-medium transition-colors ring-focus';

/** Additional classes for the active/selected tab item. */
export const tabSwitchItemActiveClasses =
  'bg-primary text-primary-foreground shadow-sm';

/** Additional classes for inactive tab items. */
export const tabSwitchItemInactiveClasses =
  'text-muted-foreground hover:bg-muted/50 hover:text-foreground';
