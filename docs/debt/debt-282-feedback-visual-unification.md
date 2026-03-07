# DEBT-282: Feedback Visual Unification with Choice Buttons

**Priority:** P2
**Created:** 2026-03-07
**Source:** [BS-043](../brainstorming/bs-043-question-flow-typography-and-feedback-visual-unification.md)
**Governing Policy:** [Typography Policy](../frontend/typography-policy.md)
**Scope:** Unify badge treatment, typography tiers, and layout spacing in `feedback.tsx` to match `choice-button.tsx`
**Prerequisite:** [DEBT-278](./debt-278-verdict-badge-solid-pill-styling.md) (verdict badge solid pill) — ships first, touches the same file but different element

---

## Problem

After BUG-155/157 (commit `48b5c9a4`), the question flow has a visual split between pre-submission and post-submission:

| Dimension | Pre-submission (`choice-button.tsx`) | Post-submission (`feedback.tsx`) |
|-----------|--------------------------------------|----------------------------------|
| Badge | Circular `h-7 w-7 rounded-full border bg-muted` | Plain text `A)` |
| Answer text | `text-base text-foreground` (Primary tier) | Inherited `text-sm` on answer rows; 4 Primary-tier `<Markdown>` calls omit an explicit className |
| Layout gap | `gap-3` | `gap-1` |
| Padding | `p-4` | `p-3` |

The same answer text visibly shrinks after submission. The plain `A)` labels look like debug output next to the polished circular badges. This is the most jarring visual inconsistency in the question flow.

Additionally, wrong-answer cards have a **hierarchy inversion**: the answer title uses `text-muted-foreground` (dim) while the explanation body inherits `text-foreground` (bright). The subordinate content is more prominent than the primary content — the thing users should scan first is the quietest element.

**Typography Policy violations:** 4 of 9 `<Markdown>` call sites in `feedback.tsx` omit className, violating Rule 1 ("Every `<Markdown>` call MUST include a tier-appropriate className") and Rule 6 ("Same content, same tier").

---

## Solution

Apply Option B from BS-043: keep `text-base` for content, promote feedback to match choice buttons.

### Change 1: Circular badge (highest impact)

Replace plain text `{choice.displayLabel})` with the circular badge pattern from `choice-button.tsx`.

**Before (4 locations):**
```tsx
<span className="shrink-0">{choice.displayLabel})</span>
// or
<span className="shrink-0 font-medium">{choice.displayLabel})</span>
```

**After (all 4 locations):**
```tsx
<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
  {choice.displayLabel}
</div>
```

This is the same markup from `choice-button.tsx:59-68` in its default (no-verdict) state. We use the default state because feedback badges are display-only — they don't need selected/correct/incorrect variants.

**Locations in `feedback.tsx`:**
- Lines 70-72 (correct answer card — `CorrectAnswerSection`)
- Line 157 (correct-flow wrong-answer cards)
- Lines 179-181 (incorrect-flow "Your answer" card)
- Line 212 (incorrect-flow wrong-answer cards)

### Change 2: Typography alignment (Pipeline 2 compliance)

Add tier-appropriate `className` to all `<Markdown>` calls per the Typography Policy.

| Call Site | Content Type | Current className | Target className |
|-----------|-------------|-------------------|-----------------|
| Line 73 — correct answer text | Primary | *none* | `"text-base text-foreground"` |
| Line 77 — explanation | Secondary | `explanationClassName` (`"mt-2 text-sm"` when a correct choice exists; otherwise `"text-sm"`) | Unchanged (already compliant) |
| Line 158 — wrong choice text | Primary | *none* | `"text-base text-foreground"` |
| Line 162 — wrong choice explanation | Secondary | `"mt-2 text-sm"` | `"mt-2 text-sm text-muted-foreground"` (hierarchy fix) |
| Line 182 — user's wrong answer text | Primary | *none* | `"text-base text-foreground"` |
| Line 187 — user's wrong answer explanation | Secondary | `"mt-2 text-sm"` | `"mt-2 text-sm"` (already compliant) |
| Line 213 — other wrong choice text | Primary | *none* | `"text-base text-foreground"` |
| Line 217 — other wrong choice explanation | Secondary | `"mt-2 text-sm"` | `"mt-2 text-sm text-muted-foreground"` (hierarchy fix) |
| Line 232 — reference | Tertiary | `"mt-1 text-xs"` | `"mt-1 text-xs"` (already compliant) |

**Net change:** 4 of 9 `<Markdown>` calls gain `className="text-base text-foreground"`.

### Change 3: Layout alignment

| Property | Current (`feedback.tsx`) | Target (match `choice-button.tsx`) |
|----------|-------------------------|------------------------------------|
| Answer row gap | `gap-1` | `gap-3` |
| Section card padding | `p-3` | `p-4` |

**Locations for gap change (4 answer rows):**
- Line 69: `flex items-start gap-1 text-sm text-foreground` → `flex items-start gap-3`
- Line 156: `flex items-start gap-1 text-sm text-muted-foreground` → `flex items-start gap-3`
- Line 178: `flex items-start gap-1 text-sm text-foreground` → `flex items-start gap-3`
- Line 211: `flex items-start gap-1 text-sm text-muted-foreground` → `flex items-start gap-3`

Note: `text-sm text-foreground` / `text-sm text-muted-foreground` on the answer row div are removed. Text sizing now comes from the `<Markdown>` className (Change 2). The `text-muted-foreground` for wrong-answer cards moves from the answer row div to the explanation Markdown (Change 4) — see hierarchy inversion fix below.

**Locations for padding change (4 section cards):**
- Line 67: correct answer card `p-3` → `p-4`
- Lines 154, 209: wrong-answer cards `p-3` → `p-4`
- Line 177: "Your answer" card `p-3` → `p-4`

### Change 4: Wrong-answer hierarchy inversion fix

**Problem (identified by Chrome agent visual audit):** Wrong-answer cards currently have a **hierarchy inversion** — the answer title is muted (`text-muted-foreground` on the parent row div, ~`rgb(131,131,131)` in dark mode) while the explanation body inherits `text-foreground` (~`rgb(237,237,237)`). The subordinate content is brighter than the primary content. The thing the user should scan first (the answer) is visually quieter than the explanation below it.

**Fix:** Remove `text-muted-foreground` from the answer row div. Apply `text-muted-foreground` to the explanation instead. This restores correct hierarchy:

| Element | Before | After |
|---------|--------|-------|
| Wrong-answer answer title row | `text-muted-foreground` (muted — dim) | No color class (inherits `text-foreground` — bright) |
| Wrong-answer answer text (Markdown) | No className (inherits muted from parent) | `"text-base text-foreground"` (Primary tier, bright) |
| Wrong-answer explanation (Markdown) | `"mt-2 text-sm"` (inherits `text-foreground` — bright) | `"mt-2 text-sm text-muted-foreground"` (Secondary tier, muted) |

**Result:** The answer title is now visually louder than the explanation. Wrong-answer cards are differentiated from correct/your-answer cards by the card border/background treatment (`border-border/60 bg-background/50`) rather than by dimming the answer text itself. This matches how choice buttons work — all choices have equal text prominence, differentiated by border color only.

Updated table for wrong-answer Markdown calls:

| Call Site | Content Type | Target className |
|-----------|-------------|-----------------|
| Line 158 — wrong choice text | Primary | `"text-base text-foreground"` |
| Line 162 — wrong choice explanation | Secondary (muted) | `"mt-2 text-sm text-muted-foreground"` |
| Line 213 — other wrong choice text | Primary | `"text-base text-foreground"` |
| Line 217 — other wrong choice explanation | Secondary (muted) | `"mt-2 text-sm text-muted-foreground"` |

---

## Target Code

### CorrectAnswerSection (correct answer card)

```tsx
{correctChoice ? (
  <div className="flex items-start gap-3">
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
      {correctChoice.displayLabel}
    </div>
    <Markdown content={correctChoice.textMd} className="text-base text-foreground" />
  </div>
) : null}
```

### Correct-flow wrong-answer card

```tsx
<div className="rounded-xl border border-border/60 bg-background/50 p-4 dark:border-foreground/40">
  <div className="flex items-start gap-3">
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
      {choice.displayLabel}
    </div>
    <Markdown content={choice.textMd} className="text-base text-foreground" />
  </div>
  <Markdown
    content={choice.explanationMd}
    className="mt-2 text-sm text-muted-foreground"
  />
</div>
```

### Incorrect-flow "Your answer" card

```tsx
<div className="mt-2 rounded-xl border border-destructive bg-destructive/5 p-4">
  <div className="flex items-start gap-3">
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
      {userChoice.displayLabel}
    </div>
    <Markdown content={userChoice.textMd} className="text-base text-foreground" />
  </div>
  {userChoice.explanationMd ? (
    <Markdown
      content={userChoice.explanationMd}
      className="mt-2 text-sm"
    />
  ) : null}
</div>
```

### Incorrect-flow wrong-answer card

Same as correct-flow wrong-answer card (see above).

### Correct answer card padding

```tsx
<div className="mt-2 rounded-xl border border-success/60 bg-success/5 p-4">
```

---

## Design Rationale

| Decision | Rationale |
|----------|-----------|
| Circular badge in feedback | Visual continuity — the same answer text should look the same before and after submission. The circular badge is the app's established pattern for answer labels. |
| Default (no-verdict) badge state | Feedback badges are display-only, not interactive. Using the default state avoids implying clickability or correctness via the badge itself — correctness is communicated by the section card border colors. |
| `text-base` for Primary tier content | Typography Policy Rule 5: "Content primary stays at `text-base`." Same content, same tier (Rule 6). |
| Hierarchy inversion fix for wrong-answer cards | Current code has answer title muted + explanation bright — inverted. Fix: answer title at `text-foreground` (bright, scannable), explanation at `text-muted-foreground` (subordinate). Wrong answers are differentiated by card border/background, not by dimming the answer text. |
| `gap-3` and `p-4` | Matches `choice-button.tsx` exactly. Ensures consistent density and breathing room. |
| No shared component extraction | The badge markup is ~3 lines of Tailwind classes. Extracting a shared `AnswerBadge` component would be premature — the two use sites (choice-button and feedback) have different parent styling contexts. Shared class constants are an option but low value for 2 consumers. |

---

## What This Does NOT Change

- **Verdict badge** — handled by [DEBT-278](./debt-278-verdict-badge-solid-pill-styling.md)
- **Section card border colors** (`border-success/60`, `border-destructive`, `border-border/60`) — intentionally deferred. They are functionally acceptable for this pass, but not part of the typography/layout contract this debt resolves.
- **Section card background fills** (`bg-success/5`, `bg-destructive/5`, `bg-background/50`) — intentionally deferred. Surface-token harmonization can be evaluated in a later visual pass if the question flow still feels split after DEBT-278 + DEBT-282.
- **Regular React/app-chrome supporting-copy typography drift** — resolved separately in [DEBT-283](../_archive/debt/debt-283-hardcoded-ui-typography-explicit-sizing-alignment.md)
- **Clinical pearl callout styling** — already correct, preserved as-is
- **Reference section** — already compliant (`Reference` label is `text-xs font-semibold uppercase tracking-wide text-muted-foreground`; citation Markdown is `mt-1 text-xs`)
- **Explanation text size** — stays at `text-sm` (Secondary tier). Wrong-answer explanation color changes to `text-muted-foreground` (Change 4 hierarchy fix)
- **Section labels** ("Correct answer", "Your answer", "Why other answers are wrong:") — these are Pipeline 1 app chrome, stay at `text-sm font-medium text-foreground`

---

## Implementation Order

1. **Ship DEBT-278 first** (verdict badge solid pill). It's self-contained, touches only the verdict `<span>`, and reduces the diff surface for DEBT-282.
2. **Then ship DEBT-282** (this doc). Changes: badge markup, Markdown classNames, gap, padding.

Both touch `feedback.tsx` but different elements. Shipping DEBT-278 first avoids merge conflicts and gives a smaller, reviewable first PR.

---

## Affected Tests

### 1. `Feedback.test.tsx`

Tests that assert on current badge text patterns (`B)`, `A)`) will need updates because the badge changes from inline `{displayLabel})` to a `<div>` containing `{displayLabel}` (no closing paren).

**Tests asserting `B)` or `A)` text content (7 tests):**
- `T1: wraps correct-flow correct-answer content in a success card` (line 106: `expect(successCardText).toContain('B)')`)
- `T3: wraps incorrect-flow your-answer content in a destructive card` (line 200: `expect(destructiveCardText).toContain('A)')`)
- `T4: wraps incorrect-flow correct-answer content in a success card` (line 243: `expect(successCardText).toContain('B)')`)
- `renders correct answer details when a correct choice is present` (line 497: `expect(html).toContain('B)')`)
- `renders non-null choice explanations in display-label order` (lines 536 and 539: `expect(html).toContain('A)')`, `expect(html).not.toContain('B) Second option')`)
- `renders the your-answer section before...` (line 693: `expect(html).toContain('A)')`)
- `renders your-answer choice details when selected wrong explanation is null` (line 932: `expect(html).toContain('A)')`)

**Update strategy:** Change `toContain('B)')` to `toContain('B')` (the label text without the paren). Verify the label is inside a `rounded-full` element if specificity is needed. For the `not.toContain('B) Second option')` assertion (line 539), switch to a DOM query verifying the correct choice is absent from the wrong-answers section; a raw string replacement like `BSecond option` is brittle once the badge becomes separate markup.

**Tests asserting layout classes:**
- `uses larger verdict-to-explanation spacing...` (lines 629-660; selector at lines 654-656) — this test locates a `text-muted-foreground` div. After the hierarchy inversion fix, the row no longer carries that class. Update the selector to target the explanation block rather than the pre-DEBT-282 row wrapper.
- `T5: keeps wrong-answer cards on neutral styling only` (lines 294-360) — asserts `border-border/60` and `bg-background/50`, both unchanged.
- Dark boundary override tests (lines 363-469) — assert `dark:border-foreground/40`, unchanged.
- Explanation-fallback tests (lines 134-156 and 248-291) assert `text-muted-foreground` on the "Explanation not available." paragraph. Those assertions are unrelated to Change 4 and should remain unchanged.

**Tests asserting `gap-1`:** None currently assert gap classes directly.

### 2. `theme-token-regression.test.tsx`

Lines 380-383 assert `bg-success` and `bg-destructive` — these are for the **verdict badge** after DEBT-278, not for any badge/layout/typography contract DEBT-282 changes. No additional changes needed from DEBT-282.

### 3. E2E tests

`cross-page-navigation.spec.ts` and `core-app-pages.spec.ts` check for `'Correct answer'` text visibility and link navigation but do not assert on badge styling or typography. No changes needed.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Correct answer card — badge | Circular `rounded-full` badge with letter centered, no trailing `)` |
| T2 | Correct answer card — text | `text-base text-foreground` (16px, matches choice button) |
| T3 | Wrong-answer cards — badge | Same circular badge, full brightness (neutral default state) |
| T4 | Wrong-answer cards — answer text | `text-base text-foreground` (16px, bright — scannable) |
| T4b | Wrong-answer cards — explanation text | `text-sm text-muted-foreground` (14px, muted — subordinate to answer title) |
| T5 | "Your answer" card — badge | Same circular badge |
| T6 | "Your answer" card — text | `text-base text-foreground` (16px) |
| T7 | Layout gap | All answer rows use `gap-3` (same as choice-button) |
| T8 | Section card padding | All section cards use `p-4` (same as choice-button) |
| T9 | Explanation text unchanged | `text-sm` (Secondary tier) — no visual change |
| T10 | Reference section unchanged | `text-xs` (Tertiary tier) — no visual change |
| T11 | Section labels unchanged | `text-sm font-medium` (Pipeline 1) — no visual change |
| T12 | Clinical pearl preserved | `border-l-2` callout renders correctly |
| T13 | Light mode visual check | Badge, typography, spacing all consistent between choice buttons and feedback |
| T14 | Dark mode visual check | Same as T13; badge dark overrides (`dark:border-foreground/60 dark:bg-foreground/20`) match choice-button |

---

## Scope Boundary

This debt doc covers feedback card visual unification only. It does NOT cover:
- Verdict badge styling (DEBT-278)
- Future user-selectable font size feature (tracked in Typography Policy)
- Dark mode border weight tiering (BS-044)
- Any changes to `choice-button.tsx` or `question-card.tsx`
