# DEBT-317: Practice "Questions" Block Centers Itself on Narrow Screens

**Priority:** P3
**Created:** 2026-03-16
**Scope:** Page-local CSS alignment bug in the Practice session starter.

---

## Context

The Practice page already uses the resolved DEBT-311 layout for the Mode/Questions row:

- At `sm` and above, the row is `sm:flex-row sm:items-end`, so the two control blocks sit side by side and bottom-align.
- Below `sm`, the row stacks vertically via `flex-col`.

The remaining narrow-screen defect is local to the Questions block. On narrow screens, **Questions** is the only section in the card whose visible label and control are horizontally centered; **Mode**, **Status**, **Difficulty**, and the filter sections all read from the left edge.

That mismatch makes the Questions block feel visually detached from the rest of the form even though it already lives in the correct parent row.

---

## Root Cause

**Source of truth:** `app/(app)/app/practice/components/practice-session-starter.tsx:117-157`

The Questions wrapper is its own flex column and explicitly centers its children:

```tsx
<div className="flex flex-col items-center gap-2">
  <label ...>Questions</label>
  <div className={compactControlShellClasses}>
    <Input ... />
  </div>
</div>
```

`items-center` acts on the cross-axis of that `flex-col`, so it horizontally centers both the label and the input shell at every breakpoint.

The parent row at line 117:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
```

only controls how the **Mode** and **Questions** wrappers align relative to each other. It does **not** change the internal horizontal alignment of the Questions wrapper.

This is why the defect is most obvious below `sm`: once the row stacks, the centered Questions block sits between left-aligned sections above and below it.

The current behavior is also codified in a source-backed render test:

- `app/(app)/app/practice/components/practice-session-starter.test.tsx:237-279` asserts that the Questions wrapper currently includes `items-center`

---

## Recommended Fix

Keep the existing sibling structure. Do **not** move Questions into the Mode container.

The minimal and correct fix is to left-align the Questions wrapper itself:

```diff
- <div className="flex flex-col items-center gap-2">
+ <div className="flex flex-col items-start gap-2">
```

Why this is the right fix:

- Mode and Questions are already siblings in the same responsive row, which is the correct structure.
- `sm:items-end` already handles their shared desktop alignment.
- The bug is the Questions wrapper's internal alignment token, not a missing container relationship.
- The input can keep `text-center`; only the wrapper needs to stop centering itself.

If design requirements later become stricter than "make Questions align with the rest of the card," a small grid could align both labels and controls with more precision. That is not necessary for this defect.

---

## Test Impact

This is not "CSS only" in the sense of being test-free. The existing static markup tests will need to change if the code fix lands.

Relevant tests:

- `app/(app)/app/practice/components/practice-session-starter.test.tsx:233-234` already verifies the row keeps `sm:items-end`
- `app/(app)/app/practice/components/practice-session-starter.test.tsx:237-279` currently asserts `items-center` on the Questions wrapper and would need to be updated to `items-start`

No behavior logic or controller tests should be affected.

---

## Related Follow-Up: SegmentedControl Can Overflow on Narrow Widths

There is a separate narrow-screen risk in the shared segmented-control styling:

- `components/ui/control-shell-styles.ts:7-8` defines the outer shell as `inline-flex ... p-1`
- `components/ui/tab-switch-styles.ts:15-16` defines each tab item as non-wrapping `px-4 py-2 text-sm`

That combination means the control is structurally non-wrapping. On sufficiently narrow widths, wide option sets such as Practice **Status** can exceed the available inline space.

Code proves the overflow risk exists. Code alone does **not** prove the exact breakpoint or the user-visible failure mode on every device, so any claim like "it always clips at 375px" should be treated as unverified until browser-tested.

If this follow-up is pursued, prefer one of these approaches:

- Add an opt-in overflow/wrap behavior to `SegmentedControl`
- Add a page-local wrapper around the widest Practice instances

Avoid changing `compactControlShellClasses` globally unless the same behavior is desired for other consumers such as History tabs and the Practice Questions input shell.

---

## Out Of Scope: Shared 44px Touch Targets

The current 36px shared control heights are real, but they are **not** new active debt for this repo.

Source of truth:

- `components/ui/button.tsx:27-30` keeps shared button sizes at `h-9`, `h-8`, `h-10`, and `size-9`
- `docs/frontend/standards.md:555-563` explicitly accepts current shared touch target sizes as project policy
- `docs/_archive/debt/debt-298-ui-structural-consistency.md:86-96` records the same decision

Do not treat the 44px discussion as part of the fix for this Practice alignment bug unless product direction changes and that policy is reopened.

---

## Effort Estimate

**Trivial** for the narrow-screen alignment fix: one class change plus one source-backed test update.

The SegmentedControl follow-up is still small, but it touches a shared primitive and needs browser verification before choosing wrap vs scroll behavior.
