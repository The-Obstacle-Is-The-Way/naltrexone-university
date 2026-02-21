# BS-027: History Tab Bar Visual Inconsistency - Verified Audit and Fix Direction

**Date:** 2026-02-21  
**Status:** Re-audited against current codebase + cross-checked against browser-agent feedback  
**Scope:** History tab switcher drift, related toggle consumers, token usage, row/card consistency, and recommended integration path  
**Related files:**  
- `app/(app)/app/history/components/history-tab-bar.tsx`  
- `components/ui/segmented-control.tsx`  
- `app/(app)/app/history/components/history-sessions-tab.tsx`  
- `app/(app)/app/dashboard/page.tsx`  
- `components/ui/button.tsx`

---

## Executive Summary

The original diagnosis was directionally right: History tabs visually drift from the shared segmented control pattern.  

However, the follow-up audit found important corrections:

1. The drift is **not isolated to History** tokens (`bg-muted/20`, `border-border/60` also appear in Dashboard and Practice).
2. `HistoryTabBar` **does have tests** (`history-tab-bar.test.tsx`).
3. There is at least one more active toggle-like primitive (`FilterChip`) beyond HistoryTabBar and SegmentedControl.

Opinionated call: the best fix is **shared tab-switch visual primitives with separate semantic wrappers**. Do not mix link and button behavior into one polymorphic monolith.

---

## Claim Verification and Corrections

| Claim | Verdict | Evidence |
|------|---------|----------|
| `HistoryTabBar` wrapper uses `rounded-full border border-border/60 bg-muted/20` | Correct | `app/(app)/app/history/components/history-tab-bar.tsx:14` |
| `SegmentedControl` wrapper uses `rounded-lg border border-border bg-muted` | Correct | `components/ui/segmented-control.tsx:24` |
| `HistoryTabBar` active uses `bg-background text-foreground shadow-sm` | Correct | `app/(app)/app/history/components/history-tab-bar.tsx:20`, `app/(app)/app/history/components/history-tab-bar.tsx:31` |
| `SegmentedControl` active uses `bg-primary text-primary-foreground shadow-sm` | Correct | `components/ui/segmented-control.tsx:40` |
| `HistoryTabBar` is one-off and only used on History page | Correct (runtime usage) | `app/(app)/app/history/history-page-client.tsx:35` |
| `HistoryTabBar` has no tests | Incorrect | `app/(app)/app/history/components/history-tab-bar.test.tsx:1` |
| `bg-muted/20` and `border-border/60` are History-only drift tokens | Incorrect | Also in `app/(app)/app/dashboard/page.tsx:147`, `app/(app)/app/dashboard/page.tsx:204`, `app/(app)/app/dashboard/page.tsx:226`, `app/(app)/app/practice/components/practice-session-starter.tsx:213` |

---

## 1. Tab Switcher Audit

### Verified class-level differences

| Aspect | `SegmentedControl` | `HistoryTabBar` |
|------|----------------------|-----------------|
| Container shape | `rounded-lg` | `rounded-full` |
| Container bg | `bg-muted` | `bg-muted/20` |
| Container border | `border-border` | `border-border/60` |
| Item shape | `rounded-md` | `rounded-full` |
| Item vertical padding | `py-1.5` | `py-2` |
| Active state | `bg-primary text-primary-foreground shadow-sm` | `bg-background text-foreground shadow-sm` |
| Inactive text | `text-muted-foreground` | `text-muted-foreground` |
| Class composition | `cn(...)` | template string concat |
| Semantics | `fieldset` + `button` + `aria-pressed` | `nav` + `a` + `aria-current` |

### Important nuance

The wrappers are different, but not totally unrelated. They still share primitives like `inline-flex`, `border`, and `p-1`. The key problem is **token and state contrast drift**, especially active state.

---

## 2. Consumer Inventory

### `HistoryTabBar` imports

- `app/(app)/app/history/history-page-client.tsx:8`
- test import at `app/(app)/app/history/components/history-tab-bar.test.tsx:5`

### `SegmentedControl` imports

- `app/(app)/app/practice/components/practice-session-starter.tsx:8`
- `app/(app)/app/practice/quick/quick-practice-client.tsx:13`

### Other toggle-like components in active use

- `components/ui/filter-chip.tsx:10` (used at `app/(app)/app/practice/components/practice-session-starter.tsx:227`)
- `components/theme-toggle.tsx:8` (theme toggle; not a segmented/tab control but another toggle pattern)

### FilterChip proves the true root cause

`FilterChip` uses `rounded-full` (pill shape, same as `HistoryTabBar`) **but** its active state is `border-primary bg-primary text-primary-foreground` (same active color as `SegmentedControl`). This is critical evidence:

| Component | Shape | Active Color |
|---|---|---|
| `SegmentedControl` | rectangular (`rounded-md`) | `bg-primary text-primary-foreground` (white) |
| `FilterChip` | pill (`rounded-full`) | `bg-primary text-primary-foreground` (white) |
| `HistoryTabBar` | pill (`rounded-full`) | `bg-background text-foreground` (dark-on-dark) |

**The pill shape is not the problem.** `FilterChip` is pill-shaped and looks fine. The **isolated root cause is `HistoryTabBar` using `bg-background` as its active state** — the only component in the entire app that does this. In dark mode, `bg-background` resolves to `rgb(9,9,9)`, which is the page canvas color itself, making the active indicator essentially invisible against the `bg-muted/20` container.

---

## 3. shadcn Tabs Check

- `components/ui/tabs.tsx` does **not** exist.
- No Radix/shadcn Tabs usage found in app/runtime code.
- There is no third tab variant from `Tabs` currently in play.

---

## 4. Session Row Card / Container Audit

### History sessions list

- Row shell is custom `<li>` classes: `rounded-xl border border-border/60 bg-muted/20 p-3`  
  `app/(app)/app/history/components/history-sessions-tab.tsx:80`
- Not using shared `Card`.
- No row-level hover/focus affordance (interactivity is via the internal button).

### Dashboard recent rows

- Custom row shells too (not `Card` per row), but using similar tokens plus hover/focus for links:  
  `app/(app)/app/dashboard/page.tsx:147`, `app/(app)/app/dashboard/page.tsx:226`
- Also has non-link unavailable row with same base shell:  
  `app/(app)/app/dashboard/page.tsx:204`

### Practice/Dashboard section containers

- Shared `Card` is used heavily for major sections (`bg-card`, `rounded-2xl`, etc.).  
  Example: `app/(app)/app/practice/components/practice-session-starter.tsx:100`, `app/(app)/app/dashboard/page.tsx:61`
- History sessions tab content is list-first, not wrapped in a top-level `Card` section.

Conclusion: there is some divergence in structural composition, but this is broader than the tab bar and appears partly intentional by feature.

---

## 5. "View breakdown" Button Audit

- Rendered via shared `Button` component with `variant="outline"` and `className="rounded-full"`:  
  `app/(app)/app/history/components/history-sessions-tab.tsx:96`
- This is not a one-off primitive.
- It follows the same button system as Practice and Dashboard (`components/ui/button.tsx:18`).

---

## 6. Token Drift Audit Beyond the Tab Bar

### Targeted token search results (runtime code, excluding docs/tests)

- `bg-muted/20` appears in History, Dashboard, and Practice (`details` tag groups):  
  `app/(app)/app/history/components/history-tab-bar.tsx:14`  
  `app/(app)/app/history/components/history-sessions-tab.tsx:80`  
  `app/(app)/app/dashboard/page.tsx:147`  
  `app/(app)/app/dashboard/page.tsx:204`  
  `app/(app)/app/dashboard/page.tsx:226`  
  `app/(app)/app/practice/components/practice-session-starter.tsx:213`

- `border-border/60` appears in the same cross-page pattern plus question feedback:  
  `components/question/feedback.tsx:75`

So these tokens are **not isolated history drift**. The truly isolated drift is the **History tab switcher active state and shape** relative to segmented controls.

---

## 7. Test Coverage

- `HistoryTabBar` unit test exists: `app/(app)/app/history/components/history-tab-bar.test.tsx`
- `SegmentedControl` unit test exists: `components/ui/segmented-control.test.tsx`
- Gap: no explicit regression test that enforces visual token parity between history tabs and segmented controls.

---

## 8. External Browser-Agent Feedback Reconciliation

The external browser/Claude audit aligns on the major point: History tab switcher feels visually different and active state is low-emphasis in dark mode.

Corrections to that feedback based on code:

1. "No class overlap" is overstated. There is overlap (`inline-flex`, `border`, `p-1`), but key state/style tokens still diverge.
2. "Token drift is only History" is inaccurate. `bg-muted/20` and `border-border/60` are reused elsewhere.
3. "View breakdown is one-off" is inaccurate. It is a shared `Button` variant usage.

Overall: the browser feedback is useful and directionally consistent with this doc, but some conclusions were over-absolute.

---

## Fix Direction (Decided)

**Approach:** Shared visual class constants with separate semantic wrappers (specced as SPEC-037).

- Extract canonical tab-switch visual tokens into `components/ui/tab-switch-styles.ts`
- `SegmentedControl` and `HistoryTabBar` both consume the shared constants
- Semantic structure stays separate: `fieldset`/`button`/`aria-pressed` vs `nav`/`Link`/`aria-current`
- Use current `SegmentedControl` visuals as source of truth
- Add parity tests + frontend standards documentation

**Why this approach (not alternatives):**
1. Polymorphic component (link+button in one) — rejected: mixes concerns, complicates accessibility contracts
2. One-time restyle without shared constants — rejected: they will drift again
3. Shared visual primitive + separate wrappers — **chosen**: prevents drift, preserves semantics, minimal abstraction

**Out of scope for this fix:**
- Row-card/container unification (History `<li>` vs Dashboard `<a>` rows) — separate UX pattern decision
- `FilterChip` visual unification — already uses `bg-primary`, not drifted
- Token opacity patterns (`bg-muted/20`, `border-border/60`) — used consistently across pages, not the root cause

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-21 | Created original brainstorm | Initial visual inconsistency found |
| 2026-02-21 | Re-audited and corrected | Confirmed class-level facts, corrected false assumptions about token isolation and test coverage |
| 2026-02-21 | FilterChip analysis added | Proves pill shape is not the problem; `bg-background` active state is the isolated root cause |
| 2026-02-21 | Fix direction decided | Shared visual constants + separate semantic wrappers; specced as SPEC-037 |
