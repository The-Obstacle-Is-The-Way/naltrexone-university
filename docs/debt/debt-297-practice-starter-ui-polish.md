# DEBT-297: Practice Session Starter — UI Polish (Summary Text, Input Border, Number Input UX, Title Hierarchy, Spinners)

**Priority:** P3
**Created:** 2026-03-10
**Status:** Open
**Related:** DEBT-296 (filter summary hierarchy swap — resolved), DEBT-298 (broader UI consistency audit)

---

## Context

After resolving DEBT-296 (filter section summary text hierarchy swap), five UI polish issues remain on the Practice Session Starter card:

1. Verbose default summary text in collapsed filter sections
2. Questions input border inconsistency with surrounding controls
3. Questions number input prevents clearing/retyping values
4. Card title lacks visual hierarchy and heading semantics
5. Native number input spinner arrows are unstyled

These are cosmetic/UX improvements — none break functionality.

---

## Issue 1: Summary Text — "All {kind} included by default" Is Verbose

### Current behavior

When zero tags are selected in a filter category, the collapsed summary reads:

- "All topics included by default"
- "All substances included by default"
- "All treatments included by default"

### Problem

The category label ("Topic", "Substance", "Treatment") already appears on the left side of the summary row. Repeating the kind name in the default text is redundant and makes the line long, especially on narrow viewports.

### Proposed change

Replace `All ${tagKindPluralLabels[kind]} included by default` → **`All included by default`**

### Code location

`app/(app)/app/practice/components/practice-session-starter.tsx`, line 221:

```tsx
// Before:
{selectedCount === 0
  ? `All ${tagKindPluralLabels[kind]} included by default`
  : `${selectedCount} selected`}

// After:
{selectedCount === 0
  ? 'All included by default'
  : `${selectedCount} selected`}
```

### Collateral changes

- Remove `tagKindPluralLabels` constant (currently `practice-session-starter.tsx:50-54`) — becomes unused
- Update tests that assert the old text (e.g., `practice-session-starter.test.tsx` lines 157, 187, 221)
- Update `docs/frontend/pages/practice.md` line 116 — currently documents "All {kind} included by default"
- Update `docs/content/tag-taxonomy-golden-spec.md` lines 197–198

### Risk

None. Pure copy change with no logic impact.

---

## Issue 2: Questions Input Border Looks Out of Place

### Current behavior

The Questions input uses the shadcn `Input` component with:
- `border border-input` (visible border)
- `dark:border-foreground/40` (bright border in dark mode)
- `shadow-xs` (subtle shadow)

Meanwhile, Mode, Status, and Difficulty all use `SegmentedControl` which has a flat `bg-muted` container with no individual-element borders. The filter sections use `bg-foreground/5` with no border.

### Problem

The Questions input is the only control in the starter card with a visible border + shadow. In dark mode especially, the border appears bright and heavy compared to the soft, borderless aesthetic of every other control.

### Current visual separation without border

The Input already has `dark:bg-input/30` (30% opacity background tint in dark mode) and `bg-transparent` in light mode. In dark mode, this background tint provides some differentiation from the card surface. However, in light mode, the background is transparent, so removing the border would leave no visual boundary at all.

### Proposed fix options

**Option A — Remove border, add background tint (recommended):**
Override the Input classes on this specific instance:
```tsx
<Input
  id="session-count-input"
  type="number"
  min={SESSION_COUNT_MIN}
  max={SESSION_COUNT_MAX}
  className="w-24 border-0 shadow-none bg-foreground/5"
  value={props.sessionCount}
  onChange={props.onSessionCountChange}
/>
```
This uses the same `bg-foreground/5` as the filter `<details>` sections, giving visual consistency across the card. Focus ring (`focus-visible:ring-ring/50`) still provides clear focus indication.

**Option B — Soften border only:**
Reduce border opacity instead of removing it:
```tsx
className="w-24 border-foreground/10 shadow-none"
```

### Test impact

The test file does not assert border classes on the Input, only checks for `data-slot="input"` and the `id`/`for` pairing. No test changes needed for either option.

### Risk

Low. Local style override on one element. Focus ring remains intact for accessibility.

---

## Issue 3: Number Input Won't Let You Clear and Retype

### Current behavior

The Questions input is a controlled `<input type="number">` with value always set to `props.sessionCount` (a `number`). On every `onChange`, `handleSessionCountChange` runs:

```typescript
// practice-page-session-start.ts, lines 26-41
export function handleSessionCountChange(
  setSessionCount: (count: number) => void,
  event: { target: { value: string } },
): void {
  const parsed = Number(event.target.value);
  if (!Number.isFinite(parsed)) {
    setSessionCount(SESSION_COUNT_MIN); // 1
    return;
  }
  const clamped = Math.min(
    SESSION_COUNT_MAX,
    Math.max(SESSION_COUNT_MIN, Math.trunc(parsed)),
  );
  setSessionCount(clamped);
}
```

### Root cause

When the user tries to clear the field (backspace → empty string):
1. `Number('')` → `0`
2. `Number.isFinite(0)` → `true`
3. `Math.max(1, 0)` → `1`
4. State updates to `1`, input re-renders with "1"

The user never gets an empty field to type into. They must either:
- Highlight-all then type (works but non-obvious)
- Use the browser's built-in stepper arrows (small and fiddly)

### The component question

The current `<input type="number">` is the standard shadcn `Input` with `type="number"`. Browser-native number inputs have known UX issues:
- Stepper arrows are tiny and inconsistent across browsers
- Some browsers block non-numeric keys; others don't
- The "can't clear" problem is a common React controlled-input pitfall, not a component bug

### Proposed fix options

**Option A — Allow transient empty state (recommended, minimal change):**

Store an intermediate `string` state for the raw input value. Only clamp on blur, not on every keystroke.

```typescript
// In the hook or handler:
const [rawCount, setRawCount] = useState(String(sessionCount));

// onChange: update raw string, only parse if non-empty
const onCountChange = (e: { target: { value: string } }) => {
  setRawCount(e.target.value);
  const parsed = Number(e.target.value);
  if (e.target.value !== '' && Number.isFinite(parsed)) {
    const clamped = Math.min(SESSION_COUNT_MAX, Math.max(SESSION_COUNT_MIN, Math.trunc(parsed)));
    setSessionCount(clamped);
  }
};

// onBlur: finalize — if empty or invalid, reset to current count
const onCountBlur = () => {
  setRawCount(String(sessionCount));
};
```

This requires:
- Adding `onBlur` prop to `PracticeSessionStarterProps` (or handling internally)
- Changing `value` from `props.sessionCount` to the raw string
- Updating `handleSessionCountChange` / `createSessionCountChangeHandler` and the existing unit coverage in `practice-page-logic.test.ts:977-1002` and `practice-page-logic.test.ts:1197-1210`
- Updating `practice-session-starter.tsx` and `practice-session-starter.test.tsx` if the input starts rendering the transient raw string rather than the clamped numeric prop

**Option B — Custom stepper component:**

Build or install a `NumberStepper` with +/- buttons flanking the input. Libraries like Radix UI (`@radix-ui/react-number-field`) or Ark UI provide accessible number inputs with:
- Large +/- buttons
- Keyboard up/down arrow support
- Proper clear-and-retype behavior
- Min/max clamping on blur, not keystroke

However, this adds a new dependency and a new UI component. The current stepper arrows (browser-native) do work — the main friction is the can't-clear issue, which Option A solves without new dependencies.

**Option C — Dropdown/select for preset values:**

Replace the free-form number input with a dropdown of preset counts (5, 10, 15, 20, 25, 50, 100). This eliminates the typing UX issue entirely but removes the ability to pick arbitrary counts.

### Recommendation

**Option A** is the best balance — fixes the actual UX pain (can't clear and retype) with minimal code change, no new dependencies, and no visual change.

### Risk

Low. The clamp-on-blur pattern is well-established in React. Need to ensure the idempotency key still rotates correctly and that empty-string intermediate states don't trigger an API call.

---

## Issue 4: Card Title Has No Visual Hierarchy and Is Not a Heading

### Current behavior

"Start a session" uses `<div className="text-sm font-medium text-foreground">` — identical styling to every section label (Mode, Questions, Status, Difficulty, Topic, Substance, Treatment). It is a `<div>`, not a heading element.

### Problem

- **Visual:** The card title reads as a peer of its field labels instead of standing above them. All seven labels share `text-sm font-medium text-foreground` (14px / weight 500).
- **Accessibility:** Screen reader users navigating by headings skip the card entirely. The page has an `<h1>` ("Practice") but no sub-headings within the card.

### Code location

`app/(app)/app/practice/components/practice-session-starter.tsx`, line 106:

```tsx
// Before:
<div className="text-sm font-medium text-foreground">
  Start a session
</div>

// After:
<h2 className="text-base font-semibold text-foreground">
  Start a session
</h2>
```

### Collateral changes

- Update test assertions if any check for the title element type or class
- Update `docs/frontend/pages/practice.md` so the Session Starter card inventory no longer documents the title as a plain `<div>`

### Risk

None. Semantic and visual improvement only.

---

## Issue 5: Native Number Input Spinner Arrows Are Unstyled

### Current behavior

The `<input type="number">` shows browser-native stepper arrows (up/down) that look unpolished, especially in dark mode. The arrows have low contrast and a distinctly "browser default" appearance that clashes with the custom-styled UI.

### Proposed fix

Hide the native spinners via CSS and rely on keyboard up/down arrows (which still work) and direct typing:

```tsx
<Input
  id="session-count-input"
  type="number"
  min={SESSION_COUNT_MIN}
  max={SESSION_COUNT_MAX}
  className="w-24 border-0 shadow-none bg-foreground/5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
  value={props.sessionCount}
  onChange={props.onSessionCountChange}
/>
```

This can be combined with the Issue 2 border fix on the same `className` prop.

### Risk

Low. Keyboard increment (up/down arrows) still works. Users who relied on the tiny native steppers will use keyboard or direct typing instead.

---

## Acceptance Criteria

- [ ] Collapsed filter summaries read "All included by default" (not "All {kind} included by default")
- [ ] `tagKindPluralLabels` removed if no longer used
- [ ] Questions input border removed or softened to match surrounding controls
- [ ] Questions input allows clearing the field and typing a new number (clamp on blur)
- [ ] `practice-page-logic.test.ts` updated for the transient-empty-state session-count contract and idempotency-key rotation behavior
- [ ] Card title uses `<h2>` with visually distinct styling (`text-base font-semibold`)
- [ ] Native number input spinners hidden via CSS
- [ ] All existing tests updated and passing
- [ ] `docs/frontend/pages/practice.md` updated
- [ ] `docs/content/tag-taxonomy-golden-spec.md` updated
- [ ] Visual verification on both light and dark mode

---

## What This Does NOT Change

- Filter chip styling (resolved in DEBT-295)
- Summary text hierarchy (resolved in DEBT-296)
- SegmentedControl styling
- Session start logic or API behavior
- Broader UI consistency patterns (tracked in DEBT-298)
