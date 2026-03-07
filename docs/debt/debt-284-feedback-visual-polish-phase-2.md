# DEBT-284: Feedback Visual Polish Phase 2 — Badge Coloring, Explanation Consistency, Type Scale

**Priority:** P2
**Created:** 2026-03-07
**Status:** Resolved in current branch
**Resolved in branch:** 2026-03-07 — commit `c9275d58` (`Implement DEBT-284: Badge coloring and explanation muting`)
**Source:** Visual review after [DEBT-282](../_archive/debt/debt-282-feedback-visual-unification.md) (PR #179)
**Governing Policy:** [Typography Policy](../frontend/typography-policy.md), [Frontend Standards](../frontend/standards.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)
**Scope:** Remaining visual inconsistencies between question-flow choice buttons and post-submission feedback cards, plus explanation color consistency and type scale readability

---

## Current Status

As of **March 7, 2026**, the implementation work for DEBT-284 is complete on branch `debt-284-feedback-badge-coloring-and-explanation-muting`.

- **P1 resolved:** feedback badges now use the same semantic verdict coloring as the question-area choice badges for the featured correct/incorrect rows.
- **P2 resolved:** all explanation Markdown in feedback cards now uses the muted Secondary-tier treatment.
- **P3/P4 intentionally not implemented:** the type-scale and reference-size concerns were reviewed, but under the current Typography Policy they remain observations, not active implementation work.

This debt should remain in the active register only until the implementation branch merges and the doc can be archived.

---

## Context

DEBT-282 resolved the most jarring inconsistencies: plain `A)` text badges became circular badges, answer text got proper `text-base text-foreground` Primary tier className, layout gap/padding matched choice buttons, and the wrong-answer hierarchy inversion was fixed.

This debt covered the **next layer** of issues visible after DEBT-282: semantic badge coloring parity between the question area and feedback cards, explanation color divergence, and the type scale gap between answer text and supporting content.

---

## Complete Typography Map

Every text element in the feedback system, its source pipeline, current size, and current color:

### Pipeline 1 — Hardcoded UI Text (authored in JSX)

| Element | File:Line | Size | Color | Notes |
|---------|-----------|------|-------|-------|
| Verdict pill ("Incorrect" / "Correct") | `feedback.tsx:131` | `text-sm font-semibold` | `text-destructive-foreground` / `text-success-foreground` | Solid pill background |
| Section labels (`"Explanation"` / `"Correct answer"`, `"Your answer"`, `"Why other answers are wrong:"`) | `feedback.tsx:66,152,184,215` | `text-sm font-medium` | `text-foreground` | `feedback.tsx:66` is conditional: `"Correct answer"` when `correctChoice` exists, otherwise `"Explanation"` |
| Reference label (`"Reference"`, rendered uppercase via CSS) | `feedback.tsx:247` | `text-xs font-semibold uppercase tracking-wide` | `text-muted-foreground` | Literal string is `Reference`; `uppercase` transforms it visually |
| "Explanation not available." fallback | `feedback.tsx:84` | `text-sm` | `text-muted-foreground` | Only renders when `explanationMd` is null |
| Badge letter (A, B, C, D) | `feedback.tsx:72,162,189,225` | `text-xs font-semibold leading-none` | `text-success` / `text-destructive` / `text-foreground` | Success on correct-answer card, destructive on your-answer card, neutral on why-wrong cards |
| "Clinical Pearl" label | `Markdown.tsx:53` | `text-xs font-medium uppercase tracking-wide` | `text-muted-foreground` | Inside `border-l-2` callout |

### Pipeline 2 — Content (rendered through `<Markdown>`)

| Element | File:Line | Size | Color | Tier |
|---------|-----------|------|-------|------|
| Question stem | `question-card.tsx:35` | `text-base` (16px) | `text-foreground` | Primary |
| Choice button answer text | `choice-button.tsx:72` | `text-base` (16px) | `text-foreground` | Primary |
| Correct answer text (feedback) | `feedback.tsx:75` | `text-base` (16px) | `text-foreground` | Primary |
| Your answer text (feedback) | `feedback.tsx:192` | `text-base` (16px) | `text-foreground` | Primary |
| Wrong-answer text — correct flow (feedback) | `feedback.tsx:165` | `text-base` (16px) | `text-foreground` | Primary |
| Wrong-answer text — incorrect flow (feedback) | `feedback.tsx:228` | `text-base` (16px) | `text-foreground` | Primary |
| Correct answer explanation | `feedback.tsx:82` | `text-sm` (14px) | `text-muted-foreground` | Secondary |
| Your answer explanation | `feedback.tsx:200` | `text-sm` (14px) | `text-muted-foreground` | Secondary |
| Wrong-answer explanation — correct flow | `feedback.tsx:170` | `text-sm` (14px) | `text-muted-foreground` | Secondary |
| Wrong-answer explanation — incorrect flow | `feedback.tsx:233` | `text-sm` (14px) | `text-muted-foreground` | Secondary |
| Reference content | `feedback.tsx:250` | `text-xs` (12px) | inherits `text-card-foreground` | Tertiary |
| Clinical pearl body | `Markdown.tsx:56` | inherits from parent Markdown className | inherits | Same tier as containing explanation |

---

## Historical Findings

### P1: Feedback badges were colorless — resolved in current branch

**Before this change**, the question area (`choice-button.tsx:59-68`) used semantic verdict-colored badges, but `feedback.tsx` rendered all four feedback badges with the same neutral token set.

| Verdict | Badge classes |
|---------|-------------|
| Correct | `border-success bg-success/15 text-success` (green border, green tint, green letter) |
| Incorrect (selected wrong) | `border-destructive bg-destructive/15 text-destructive` (red border, red tint, red letter) |
| Wrong (unselected) | default neutral (no change) |

**Before the fix** (`feedback.tsx:70,160,187,223` in the pre-implementation snapshot), all feedback badges used the same neutral default:
```
border-border bg-muted text-foreground dark:border-foreground/60 dark:bg-foreground/20
```

**Current implementation:** the featured feedback badges now match the choice-button verdict tokens exactly:

| Feedback badge | Current classes |
|---------------|-----------------|
| Correct answer card (`feedback.tsx:72`) | `border-success bg-success/15 text-success` |
| Your answer card (`feedback.tsx:189`) | `border-destructive bg-destructive/15 text-destructive` |
| Why-wrong cards (`feedback.tsx:162,225`) | Neutral default unchanged |

This resolved the semantic-color discontinuity between the submitted question surface and the feedback surface. If a contrast issue is ever discovered later, it affects both components and should be tracked as a separate debt item.

### P2: Explanation color inconsistency across card types — resolved in current branch

**Before this change**, the same Secondary-tier explanation role had two different treatments:

| Card type | Explanation className | Rendered color (dark mode) |
|-----------|----------------------|---------------------------|
| Correct answer | `"mt-2 text-sm"` | Bright white (`text-foreground` inherited) |
| Your answer (wrong) | `"mt-2 text-sm"` | Bright white (`text-foreground` inherited) |
| Why other answers are wrong | `"mt-2 text-sm text-muted-foreground"` | Muted gray |

**Current implementation:** all explanation Markdown in `feedback.tsx` now uses the muted Secondary-tier treatment:

| Call Site | Current className |
|-----------|-------------------|
| `feedback.tsx:82` — correct answer explanation | `text-sm text-muted-foreground` or `mt-2 text-sm text-muted-foreground` |
| `feedback.tsx:170` — wrong-answer explanation (correct flow) | `mt-2 text-sm text-muted-foreground` |
| `feedback.tsx:200` — your answer explanation | `mt-2 text-sm text-muted-foreground` |
| `feedback.tsx:233` — wrong-answer explanation (incorrect flow) | `mt-2 text-sm text-muted-foreground` |

This closes the split treatment that DEBT-282 intentionally left behind when it only muted the supplementary wrong-answer explanations.

### P3: Type scale gap — observation only, not active work

The Typography Policy still defines three content tiers:
- Primary: `text-base` (16px) — answer text
- Secondary: `text-sm` (14px) — explanations
- Tertiary: `text-xs` (12px) — references

After P1/P2 landed, this remains a policy-governed observation rather than an active implementation item. The current SSOT still calls for `text-base` / `text-sm` / `text-xs`, so no further DEBT-284 code change is warranted unless Typography Policy and Pattern Registry are amended first.

### P4: Reference section readability — observation only, not active work

The reference section still renders as:
- Reference label (`"Reference"`, visually uppercased): `text-xs font-semibold uppercase tracking-wide text-muted-foreground`
- Reference content: `text-xs` (12px), inherits card foreground color

That remains intentional under the current Typography Policy. No additional DEBT-284 implementation work is justified unless the Tertiary-tier policy changes.

---

## What This Does NOT Change

- **Verdict pill** ("Correct" / "Incorrect") — already correct (DEBT-278)
- **Section card border colors** — correct/destructive/neutral borders are intentional
- **Section card backgrounds** — `bg-success/5`, `bg-destructive/5`, `bg-background/50` are intentional
- **Layout gap/padding** — aligned by DEBT-282, no change needed in live code (`gap-3`, `p-4`). Pattern Registry `F-5` still lists the pre-DEBT-282 `p-3` snapshot and should be synced separately rather than treated as the current component baseline.
- **Question stem or choice button text** — already compliant
- **Clinical pearl callout** — already correct
- **Section labels** — Pipeline 1 chrome, intentionally `text-sm font-medium`. The Chrome audit's "these feel subtle" observation is real as a taste/readability reaction, but under the current Typography Policy it is not a DEBT-284 implementation item unless the section-header standard itself changes.

---

## Implemented In Current Branch

### Phase 1: Badge coloring (P1)

The featured feedback badges now match `choice-button.tsx:59-68` exactly:

```tsx
// Correct answer card — green badge
<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-success bg-success/15 text-xs font-semibold leading-none text-success">

// Your answer card (wrong) — red badge
<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-destructive bg-destructive/15 text-xs font-semibold leading-none text-destructive">

// Why other answers are wrong — neutral (no change)
<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
```

**Implemented badge locations:**
- `feedback.tsx:72` (CorrectAnswerSection) → green
- `feedback.tsx:189` (Your answer card) → red
- `feedback.tsx:162` (correct-flow wrong-answer cards) → neutral (unchanged)
- `feedback.tsx:225` (incorrect-flow wrong-answer cards) → neutral (unchanged)

### Phase 2: Explanation color unification (P2) — Option A

All explanation Markdown calls now use `text-muted-foreground`:

| Call Site | Current | Target |
|-----------|---------|--------|
| `feedback.tsx:82` — correct answer explanation | `text-sm text-muted-foreground` or `mt-2 text-sm text-muted-foreground` | Implemented |
| `feedback.tsx:200` — your answer explanation | `mt-2 text-sm text-muted-foreground` | Implemented |
| `feedback.tsx:170` — wrong-answer explanation (correct flow) | `mt-2 text-sm text-muted-foreground` | Already correct |
| `feedback.tsx:233` — wrong-answer explanation (incorrect flow) | `mt-2 text-sm text-muted-foreground` | Already correct |

Note: The "Explanation not available." fallback (`feedback.tsx:84`) already used muted treatment and remained unchanged.

---

## Verification Coverage

### Badge coloring (P1)

The implemented assertions now live in `Feedback.test.tsx`:
- `T1: wraps correct-flow correct-answer content in a success card`
- `T3: wraps incorrect-flow your-answer content in a destructive card`
- `T4: wraps incorrect-flow correct-answer content in a success card`
- `T5: keeps wrong-answer cards on neutral styling only`
- `renders correct answer details when a correct choice is present`
- `renders non-null choice explanations in display-label order`

They now assert:
- Correct answer card badge has success coloring
- Your answer card badge has destructive coloring
- Why-wrong card badges remain neutral

### Explanation color (P2)

The implemented explanation-color assertions live primarily in:
- `T1: wraps correct-flow correct-answer content in a success card`
- `T3: wraps incorrect-flow your-answer content in a destructive card`
- `T4: wraps incorrect-flow correct-answer content in a success card`

The existing wrong-answer hierarchy tests (`T5` and `renders non-null choice explanations in display-label order`) continue to assert muted explanation wrappers on the neutral cards.

---

## Validation

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Correct answer card — badge color | Covered in `Feedback.test.tsx` |
| T2 | Your answer card — badge color | Covered in `Feedback.test.tsx` |
| T3 | Why-wrong cards — badge color | Covered in `Feedback.test.tsx` |
| T4 | Badge tokens match choice-button verdict tokens | Covered in `Feedback.test.tsx` |
| T5 | All explanations muted | Covered in `Feedback.test.tsx` |
| T6 | Answer text remains bright | Covered in `Feedback.test.tsx` |
| T7 | Reference section unchanged | Covered in `Feedback.test.tsx` |
| T8 | Clinical pearl preserved | Covered in `Feedback.test.tsx` |

Full branch verification passed:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm test:browser`
- `pnpm build`

---

## Open Questions

None for DEBT-284 implementation.

- **P2** is resolved to Option A (mute all explanations).
- **P3/P4** remain policy-governed observations, not active implementation questions under the current SSOT.

---

## Scope Boundary

This debt covers feedback card visual polish only. It does NOT cover:
- Dark mode border weight tiering ([BS-044](../brainstorming/bs-044-dark-mode-border-weight-tiering.md))
- User-selectable content font size (future feature in Typography Policy)
- Card background surface harmonization (deferred from DEBT-282)
- Any changes to `choice-button.tsx` or `question-card.tsx`
