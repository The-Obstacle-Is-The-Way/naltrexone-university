# DEBT-284: Feedback Visual Polish Phase 2 — Badge Coloring, Explanation Consistency, Type Scale

**Priority:** P2
**Created:** 2026-03-07
**Source:** Visual review after [DEBT-282](../_archive/debt/debt-282-feedback-visual-unification.md) (PR #179)
**Governing Policy:** [Typography Policy](../frontend/typography-policy.md), [Frontend Standards](../frontend/standards.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)
**Scope:** Remaining visual inconsistencies between question-flow choice buttons and post-submission feedback cards, plus explanation color consistency and type scale readability

---

## Context

DEBT-282 resolved the most jarring inconsistencies: plain `A)` text badges became circular badges, answer text got proper `text-base text-foreground` Primary tier className, layout gap/padding matched choice buttons, and the wrong-answer hierarchy inversion was fixed.

This debt covers the **next layer** of issues visible after DEBT-282: semantic badge coloring parity between the question area and feedback cards, explanation color divergence, and the type scale gap between answer text and supporting content.

---

## Complete Typography Map

Every text element in the feedback system, its source pipeline, current size, and current color:

### Pipeline 1 — Hardcoded UI Text (authored in JSX)

| Element | File:Line | Size | Color | Notes |
|---------|-----------|------|-------|-------|
| Verdict pill ("Incorrect" / "Correct") | `feedback.tsx:131` | `text-sm font-semibold` | `text-destructive-foreground` / `text-success-foreground` | Solid pill background |
| Section labels (`"Explanation"` / `"Correct answer"`, `"Your answer"`, `"Why other answers are wrong:"`) | `feedback.tsx:64,150,182,213` | `text-sm font-medium` | `text-foreground` | `feedback.tsx:64` is conditional: `"Correct answer"` when `correctChoice` exists, otherwise `"Explanation"` |
| Reference label (`"Reference"`, rendered uppercase via CSS) | `feedback.tsx:245` | `text-xs font-semibold uppercase tracking-wide` | `text-muted-foreground` | Literal string is `Reference`; `uppercase` transforms it visually |
| "Explanation not available." fallback | `feedback.tsx:82` | `text-sm` | `text-muted-foreground` | Only renders when `explanationMd` is null |
| Badge letter (A, B, C, D) | `feedback.tsx:70,160,187,223` | `text-xs font-semibold leading-none` | `text-foreground` | Inside circular badge div |
| "Clinical Pearl" label | `Markdown.tsx:53` | `text-xs font-medium uppercase tracking-wide` | `text-muted-foreground` | Inside `border-l-2` callout |

### Pipeline 2 — Content (rendered through `<Markdown>`)

| Element | File:Line | Size | Color | Tier |
|---------|-----------|------|-------|------|
| Question stem | `question-card.tsx:35` | `text-base` (16px) | `text-foreground` | Primary |
| Choice button answer text | `choice-button.tsx:72` | `text-base` (16px) | `text-foreground` | Primary |
| Correct answer text (feedback) | `feedback.tsx:73` | `text-base` (16px) | `text-foreground` | Primary |
| Your answer text (feedback) | `feedback.tsx:190` | `text-base` (16px) | `text-foreground` | Primary |
| Wrong-answer text — correct flow (feedback) | `feedback.tsx:163` | `text-base` (16px) | `text-foreground` | Primary |
| Wrong-answer text — incorrect flow (feedback) | `feedback.tsx:226` | `text-base` (16px) | `text-foreground` | Primary |
| Correct answer explanation | `feedback.tsx:80` | `text-sm` (14px) | `text-foreground` (inherits) | Secondary |
| Your answer explanation | `feedback.tsx:196` | `text-sm` (14px) | `text-foreground` (inherits) | Secondary |
| Wrong-answer explanation — correct flow | `feedback.tsx:168` | `text-sm` (14px) | `text-muted-foreground` | Secondary |
| Wrong-answer explanation — incorrect flow | `feedback.tsx:231` | `text-sm` (14px) | `text-muted-foreground` | Secondary |
| Reference content | `feedback.tsx:248` | `text-xs` (12px) | inherits `text-card-foreground` | Tertiary |
| Clinical pearl body | `Markdown.tsx:56` | inherits from parent Markdown className | inherits | Same tier as containing explanation |

---

## Problems

### P1: Feedback badges are colorless — question-area badges are verdict-colored after submission

**Question area after submission** (`choice-button.tsx:59-68`): Once a verdict exists, choice button badges get semantic coloring:

| Verdict | Badge classes |
|---------|-------------|
| Correct | `border-success bg-success/15 text-success` (green border, green tint, green letter) |
| Incorrect (selected wrong) | `border-destructive bg-destructive/15 text-destructive` (red border, red tint, red letter) |
| Wrong (unselected) | default neutral (no change) |

**Post-submission** (`feedback.tsx:70,160,187,223`): All feedback badges use the same neutral default:
```
border-border bg-muted text-foreground dark:border-foreground/60 dark:bg-foreground/20
```

**Visual effect:** The user sees green A / red B circles in the question card above, then all-gray circles in the feedback card below. The semantic coloring disappears at the moment it becomes most useful — when the user is reviewing what they got right and wrong.

**Proposed fix:** Add verdict-colored badge variants to feedback cards:

| Feedback card | Badge treatment |
|--------------|----------------|
| Correct answer card (green border) | Semantic success badge variant (not neutral gray) |
| Your answer card (red border) | Semantic destructive badge variant (not neutral gray) |
| Why other answers are wrong cards (neutral border) | Default neutral (no change) |

This restores semantic parity with the choice-button verdict states. The badge color reinforces the card border color rather than contradicting it.

**Policy note:** Do **not** blindly copy the current `choice-button.tsx` tinted verdict badge tokens (`border-success bg-success/15 text-success` / `border-destructive bg-destructive/15 text-destructive`) into `feedback.tsx` without a contrast check. Those tokens are visually consistent with the current choice-button badges, but they are not a clean Typography/Contrast Policy fit for 12px badge letters across all theme/state combinations. DEBT-284 should treat "semantic success/destructive badge" as the requirement; the exact token pair must remain contrast-safe.

### P2: Explanation color inconsistency across card types

Three different color treatments for the same semantic role (Secondary-tier explanation text):

| Card type | Explanation className | Rendered color (dark mode) |
|-----------|----------------------|---------------------------|
| Correct answer | `"mt-2 text-sm"` | Bright white (`text-foreground` inherited) |
| Your answer (wrong) | `"mt-2 text-sm"` | Bright white (`text-foreground` inherited) |
| Why other answers are wrong | `"mt-2 text-sm text-muted-foreground"` | Muted gray |

DEBT-282 intentionally muted wrong-answer explanations to fix a hierarchy inversion (explanation was brighter than answer title). But it did not apply the same muting to correct-answer or your-answer explanations. This creates a split: explanations in some cards are white, others are gray.

**Design question:** Should all explanations be muted, or all bright?

| Option | Approach | Rationale |
|--------|----------|-----------|
| **A: Mute all** | All explanations get `text-muted-foreground` | Consistent. Explanations are always subordinate to answer text. Card border/background conveys the semantic distinction, not text color. |
| **B: Bright all** | Remove `text-muted-foreground` from wrong-answer explanations | Consistent. All explanations are equally readable. Reverts the DEBT-282 hierarchy fix but gains uniformity. |
| **C: Keep current** | Bright in featured cards (correct, your answer), muted in supplementary cards (why wrong) | Current state. Featured cards are "primary reading" (you care about this explanation), wrong-answer cards are "reference" (why the others are wrong is less important). |

**Recommendation:** Option A (mute all). Explanations are universally subordinate to the answer title. The card border/background already communicates correct vs wrong vs neutral — the explanation doesn't need to duplicate that signal via text color.

### P3: Type scale gap — `text-base` answer text vs `text-sm` explanation

The Typography Policy defines three content tiers:
- Primary: `text-base` (16px) — answer text
- Secondary: `text-sm` (14px) — explanations
- Tertiary: `text-xs` (12px) — references

The 16→14px step is a 12.5% reduction. In dark mode with dense clinical text, this reads as a noticeable "shrink" — the explanation feels like it belongs to a different component.

**Design question:** Is the tier gap too aggressive for the feedback context?

| Option | Approach | Trade-off |
|--------|----------|-----------|
| **A: Keep current tiers** | `text-base` / `text-sm` / `text-xs` | Hierarchy is clear. Some perceived "shrink." Consistent with Typography Policy as written. |
| **B: Narrow the gap** | `text-base` / `text-base` / `text-sm` | Explanation same size as answer, differentiated by color only. Reference moves to `text-sm`. More readable but less hierarchical. |
| **C: Adjust reference only** | `text-base` / `text-sm` / `text-sm text-muted-foreground` | Reference becomes same size as explanation, differentiated by being muted. Eliminates the jump to `text-xs`. |

**Recommendation:** Option A (keep current). The tier system creates intentional hierarchy and matches the Typography Policy. If P2 is fixed (all explanations muted), the color + size together will clearly differentiate answer text from explanation. The gap only feels wrong now because the brightness inconsistency in P2 makes some explanations compete with answer text.

**Policy note:** Options B and C would require a Typography Policy + Pattern Registry change first. Under the current SSOT, P3 is an observation to keep monitoring after P1/P2, not an implementation-ready typography change.

### P4: Reference section readability

The reference section at `text-xs` (12px) looks disproportionately small after `text-base` (16px) answer text — a 25% reduction that's especially noticeable in dark mode with citation text that includes author names, journal titles, and DOIs.

**Current rendering:**
- Reference label (`"Reference"`, visually uppercased): `text-xs font-semibold uppercase tracking-wide text-muted-foreground`
- Reference content: `text-xs` (12px), inherits card foreground color

**Design question:** Should reference content be larger?

| Option | Approach |
|--------|----------|
| **A: Keep `text-xs`** | Citations are footnote-level data. Small is correct. Typography Policy Tertiary tier. |
| **B: Bump to `text-sm text-muted-foreground`** | More readable. Differentiated from explanations by muted color rather than by size. "REFERENCE" label could stay `text-xs` (or shrink further) to maintain hierarchy within the reference block. |

**Recommendation:** Option A (keep `text-xs`). References are citations, not learning content. They exist for attribution and further reading, not for active comprehension. The small size correctly signals "this is metadata." If readability is a concern, the future user-selectable font size feature (Typography Policy §Future) will scale all tiers up uniformly.

**Policy note:** Option B would require amending the Typography Policy's Tertiary tier and Pattern Registry reference pattern first. Under the current SSOT, this is not an implementation-ready DEBT-284 change.

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

## Implementation Plan

### Phase 1: Badge coloring (P1) — high impact, small diff

Add verdict-colored badge variants to `feedback.tsx`. Three badge states are needed:

| Badge state | Requirement |
|-------------|-------------|
| Correct answer card | Semantic success badge variant, contrast-safe for `text-xs` badge text, visually distinct from neutral |
| Your answer card (wrong) | Semantic destructive badge variant, contrast-safe for `text-xs` badge text, visually distinct from neutral |
| Why other answers are wrong | Keep the existing neutral badge (no change) |

Implementation detail: the badge must remain the existing `h-7 w-7 rounded-full` circle and keep the neutral variant for non-semantic cards. The exact success/destructive token pair must be chosen to satisfy the Contrast Policy instead of blindly copying the current `choice-button.tsx` tint recipe.

**Badge locations:**
- `feedback.tsx:70` (CorrectAnswerSection) → green
- `feedback.tsx:187` (Your answer card) → red
- `feedback.tsx:160` (correct-flow wrong-answer cards) → neutral (unchanged)
- `feedback.tsx:223` (incorrect-flow wrong-answer cards) → neutral (unchanged)

### Phase 2: Explanation color unification (P2) — if Option A chosen

Add `text-muted-foreground` to all explanation Markdown calls:

| Call Site | Current | Target |
|-----------|---------|--------|
| `feedback.tsx:80` — correct answer explanation | `explanationClassName` (`"mt-2 text-sm"` / `"text-sm"`) | `"mt-2 text-sm text-muted-foreground"` / `"text-sm text-muted-foreground"` |
| `feedback.tsx:196` — your answer explanation | `"mt-2 text-sm"` | `"mt-2 text-sm text-muted-foreground"` |
| `feedback.tsx:168` — wrong-answer explanation (correct flow) | `"mt-2 text-sm text-muted-foreground"` | No change |
| `feedback.tsx:231` — wrong-answer explanation (incorrect flow) | `"mt-2 text-sm text-muted-foreground"` | No change |

Note: The "Explanation not available." fallback (`feedback.tsx:82`) already uses `text-muted-foreground`, so no change needed there.

---

## Affected Tests

### Badge coloring (P1)

The most directly affected current tests in `Feedback.test.tsx` are:
- `T1: wraps correct-flow correct-answer content in a success card`
- `T3: wraps incorrect-flow your-answer content in a destructive card`
- `T4: wraps incorrect-flow correct-answer content in a success card`
- `T5: keeps wrong-answer cards on neutral styling only`
- `renders correct answer details when a correct choice is present`
- `renders non-null choice explanations in display-label order`

They already assert `rounded-full` badge structure. Add color assertions to verify:
- Correct answer card badge has success coloring
- Your answer card badge has destructive coloring
- Why-wrong card badges remain neutral

### Explanation color (P2)

The explanation-color assertions that would change live primarily in:
- `T1: wraps correct-flow correct-answer content in a success card`
- `T3: wraps incorrect-flow your-answer content in a destructive card`
- `T4: wraps incorrect-flow correct-answer content in a success card`

The current wrong-answer hierarchy tests (`T5` and `renders non-null choice explanations in display-label order`) already assert muted explanation wrappers and should remain unchanged.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Correct answer card — badge color | Semantic success badge (not neutral gray), contrast-safe for badge text |
| T2 | Your answer card — badge color | Semantic destructive badge (not neutral gray), contrast-safe for badge text |
| T3 | Why-wrong cards — badge color | Neutral (unchanged from DEBT-282) |
| T4 | Badge colors map to pre-submission verdict states | Correct/selected-wrong feedback badges are semantic, not neutral |
| T5 | All explanations muted (if Option A) | All explanation Markdown calls include `text-muted-foreground` |
| T6 | Answer text remains bright | All answer Markdown calls remain `text-base text-foreground` |
| T7 | Reference section unchanged | `text-xs` Tertiary tier |
| T8 | Clinical pearl preserved | `border-l-2` callout renders correctly |
| T9 | Dark mode visual check | Badge colors visible against card backgrounds |
| T10 | Light mode visual check | Same consistency |

---

## Open Questions

1. **P2 decision:** Mute all explanations (Option A), bright all (Option B), or keep current split (Option C)?
2. **P3/P4:** No active implementation question under the current SSOT. Keep the current tier scale unless Typography Policy / Pattern Registry is amended first.

---

## Scope Boundary

This debt covers feedback card visual polish only. It does NOT cover:
- Dark mode border weight tiering ([BS-044](../brainstorming/bs-044-dark-mode-border-weight-tiering.md))
- User-selectable content font size (future feature in Typography Policy)
- Card background surface harmonization (deferred from DEBT-282)
- Any changes to `choice-button.tsx` or `question-card.tsx`
