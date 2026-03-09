# DEBT-292: Filter Section Disclosure Indicator

**Priority:** P3
**Created:** 2026-03-09
**Status:** Resolved
**Resolved:** 2026-03-09

---

## Problem

The practice page's collapsible filter sections (Topic, Substance, Treatment) have no visual disclosure indicator — no chevron, caret, or arrow. The default `<details>` marker is suppressed (`list-none` on `<summary>`) and no replacement icon is provided.

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx:216`

```tsx
<summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]">
```

The only signals that these sections are expandable are:
1. The tonal fill shape (`bg-foreground/5`, ~1.11:1 — barely perceptible)
2. Cursor change to `pointer` on hover
3. The semantic presence of `<summary>` text
4. Keyboard focus ring on tab navigation

A user unfamiliar with the interface could mistake these for static labels, especially in the collapsed state where the sections look like quiet tinted bars.

### Pre-existing, amplified by DEBT-290

The `list-none` class existed before DEBT-290. However, DEBT-290 removed the container borders (`border border-border/60 dark:border-foreground/40`), which previously gave the sections a more tangible "panel" feel. Without borders, the collapsed sections are quieter, making the missing disclosure indicator more conspicuous.

DEBT-290 predicted this outcome in its collapsed-state guardrail:

> **Collapsed-state guardrail:** If visual QA later finds the closed `<details>` rows too quiet after border removal, the follow-up should strengthen the `<summary>` affordance (for example, a chevron or summary-only hover treatment), not reintroduce heavy container borders or weaken chip boundaries.

A Chrome-based visual audit on 2026-03-09 confirmed the concern: "Without a visual cue for expandability, first-time users may not realize these sections are interactive."

---

## Design Context

### What works already

The selected chip state is excellent (dramatic contrast flip), counts update correctly, and the expanded state is clear with well-organized chip fieldsets. The problem is specifically about **discoverability** — getting the user to realize they can expand these sections in the first place.

### The constraint from DEBT-290

DEBT-290 established that the response to "collapsed sections feel too quiet" must be a **summary affordance enhancement**, not a rollback to container borders or chip boundary weakening. The solution space is:

1. A chevron/arrow icon in the summary
2. A summary-only hover treatment
3. Both

---

## Potential Approaches

### Approach A: Rotating chevron icon

Add a `ChevronDown` icon (from `lucide-react`, already a project dependency) to the `<summary>` that rotates 180° when the section is open.

```tsx
<details className="rounded-xl bg-foreground/5 px-4 py-3 group">
  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-medium text-foreground outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:ring-ring/50 focus-visible:ring-[3px]">
    <span>{label}</span>
    <span className="flex items-center gap-2">
      <span className="text-xs font-normal text-foreground/60">
        ({selectedCount} selected)
      </span>
      <ChevronDown className="h-4 w-4 text-foreground/60 transition-transform group-open:rotate-180" />
    </span>
  </summary>
</details>
```

The `group-open:rotate-180` Tailwind utility targets the parent `<details class="group">[open]` state. The `group` class must live on `<details>`, not `<summary>`, or the chevron will never rotate.

**Tradeoff:** Adds a visual element. The icon needs to be subtle enough to not dominate the summary line but visible enough to communicate expandability.

### Approach B: Summary hover treatment

Add a hover background to the `<summary>` element to signal interactivity, similar to how list rows show hover.

```
hover:bg-foreground/[0.03] rounded-lg transition-colors
```

**Tradeoff:** Provides a hover affordance but doesn't help users who scan without hovering (mobile, keyboard, or quick visual scan). Not sufficient alone.

### Approach C: Both (recommended)

Combine the chevron (always-visible affordance) with a subtle hover treatment (interaction feedback). The chevron communicates "this is expandable" at a glance; the hover confirms "this is interactive" on pointer.

---

## Scope

### Production code

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.tsx:212–223` | Add `group` to `<details>`, add chevron icon to `<summary>`, and add summary hover treatment |

### Test updates

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | Assert presence of disclosure icon in filter section summaries, plus `group` and `group-open:rotate-180` wiring |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/pages/practice.md` | Update summary element description to include chevron |
| `docs/frontend/pattern-registry.md` | Update S-2 practice variant to note summary disclosure icon |
| `docs/debt/index.md` | Move DEBT-292 to Resolved when implemented |

---

## What This Does NOT Change

1. **Filter container tonal fill** — `bg-foreground/5` stays. The tonal fill is supplementary; the chevron is the affordance fix.
2. **FilterChip styling** — No chip changes.
3. **Container borders** — Not reintroduced. This is the constraint from DEBT-290.
4. **Selected count or helper text** — Already legible at `text-foreground/60`.

---

## Chrome Agent Audit Evidence (2026-03-09)

The Chrome-based visual audit that surfaced this finding also confirmed:

- Selected vs. unselected chip states: "emphatically" distinguishable (dark mode ~17:1, light mode similar)
- Selected counts update correctly (verified 3 topic + 2 substance → "(3 selected)", "(2 selected)")
- Available question count updates correctly (825 → 477 after filtering)
- Hover states register (text opacity 60%→100%, subtle bg-foreground/8 fill appears)
- SegmentedControl containers are visually distinct from filter containers (different fill, explicit border, inline size)
- Filter container tonal fill creates a faint grouping (~1.11:1 both themes) — works via spatial layout rather than fill contrast
- Light mode chip border contrast is noncompliant (tracked separately as DEBT-291: ~1.10:1 vs the tonal-fill parent, ~1.23:1 vs plain white/card)

---

## Outcome

Resolved in `app/(app)/app/practice/components/practice-session-starter.tsx` by shipping Approach C:

- `<details>` now carries `group` so disclosure state is available to child utilities
- `<summary>` now uses `rounded-lg transition-colors hover:bg-foreground/[0.03]`
- The right side of `<summary>` now groups the selected-count text with a `ChevronDown` icon
- The chevron uses `h-4 w-4 text-foreground/60 transition-transform group-open:rotate-180`

The tonal-fill container from DEBT-290 remains intact. No borders were reintroduced, and no FilterChip styling changed as part of this follow-up.
