# DEBT-279: WCAG AA Contrast Remediation Plan (BS-042)

**Status:** Active  
**Priority:** P1  
**Date:** 2026-03-05  
**Owner:** Frontend  
**Related:** [BS-042](../brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md), [Contrast Policy](../frontend/contrast-policy.md), [Pattern Registry](../frontend/pattern-registry.md), [DEBT-278](./debt-278-verdict-badge-solid-pill-styling.md)

---

## Description

The project now has a canonical contrast standard in `docs/frontend/contrast-policy.md` (WCAG AA targets), but current UI patterns are not compliant across key flows.

BS-042 identifies recurring failures in:
- `SC 1.4.3` text contrast (`text-muted-foreground` at `text-xs`/`text-sm` on dark surfaces)
- `SC 1.4.11` non-text boundary contrast (muted borders/fills for required boundaries)

This debt item converts BS-042 findings into an implementation plan and acceptance criteria.

### Key design principle: border vs fill

SC 1.4.11 applies to the **border** — the required boundary indicator that separates the interactive component from its background. The border must achieve >= 3.0:1 contrast against the adjacent surface.

Background **fills** are supplementary hierarchy cues, **not** WCAG compliance targets. Fills encode **state hierarchy** — they must be visually distinct across states (unselected < hover < selected) to preserve usability. Applying the same fill opacity to all states destroys hierarchy even if borders are individually compliant.

**Dark mode token reference** (computed from dark theme tokens):

| Token | Composited on card (`#121212`) | Contrast vs card |
|-------|-------------------------------|-----------------|
| `dark:border-foreground/40` | `#6a6a6a` | ~3.6:1 (passes SC 1.4.11) |
| `dark:border-foreground/30` | `#4f4f4f` | ~2.5:1 (fails) |
| `dark:bg-foreground/40` | `#6a6a6a` | ~3.6:1 (too heavy for fills) |
| `dark:bg-foreground/8` | `#232323` | subtle lift (unselected) |
| `dark:bg-foreground/15` | `#333333` | visible change (hover) |
| `dark:bg-foreground/20` | `#3e3e3e` | clear distinction (selected) |
| `border-border/60` | `#1e1e1e` | ~1.1:1 (invisible — fails) |

## Why this is debt (not a one-line fix)

This is a cross-cutting remediation spanning:
- token values (`app/globals.css`)
- shared patterns (`docs/frontend/pattern-registry.md`)
- multiple feature surfaces (question/feedback/dashboard/history/bookmarks/navigation/actions)
- light and dark theme behavior

Adjusting one class in one component will not produce consistent compliance.

## Required Change Set

### 1) Canonical docs alignment

- [ ] Keep `docs/frontend/contrast-policy.md` as normative source for WCAG contrast rules.
- [ ] Keep BS-042 as evidence/audit artifact (computed values, screenshots, reasoning), not as policy.
- [ ] Update pattern-registry pattern entries that currently encode contrast-failing defaults, or explicitly mark temporary exceptions with debt links.
- [ ] Canonicalize the question-review-specific patterns in `docs/frontend/pattern-registry.md` so the question flow is not relying on component-local class strings as de facto policy:
  - I-3 `Choice Button`
  - feedback answer cards
  - feedback reference section
  - markdown clinical pearl callout

### 2) Token-level remediation

- [ ] Raise dark-mode `--muted-foreground` from 45% to a value that passes all sampled normal-text contexts from BS-042.
- [ ] Validate candidate token against at least these backgrounds in dark mode:
  - card (`--card`)
  - muted surface (`bg-muted`) — segmented-control/tab-switch containers
  - row fill (`bg-muted/20` over card)
  - row fill (`bg-muted/20` over page background) — history session rows
  - feedback wrong card (`bg-background/50` over card)
  - feedback success card (`bg-success/5` over card)
  - page background (`--background`) — for nav links, page-level labels
  - hover fills (`bg-muted/50` over card) — for filter chips, mobile nav, inactive tabs
  - warning tint (`bg-warning/10` over page background) — for warning copy surfaces (for example, PastDueBanner)
- [ ] Verify threshold-sensitive text contexts using browser-computed integer RGB output, not only idealized HSL token math. The highest-risk case is inactive segmented-control/tab-switch text on `bg-muted`, where exact token math can pass while rounded browser output sits on the threshold.
- [ ] Recompute and document resulting text ratios in BS-042.

### 3) Required-boundary remediation (SC 1.4.11)

**Principle:** Borders carry WCAG compliance (>= 3.0:1). Fills carry state hierarchy (stepped opacity). Never apply the same fill to multiple states.

- [ ] Fix required interactive boundaries that currently rely on `border-border/60 bg-muted/20` where boundaries are not perceivable enough.
- [ ] Rework choice button base/hover/selected boundary strategy (`components/question/choice-button.tsx`) to meet policy without losing hierarchy.
  - Border: `dark:border-foreground/40` (3.6:1) for unselected, `dark:border-foreground/70` for selected — already correct.
  - Fill: Must use stepped values — `dark:bg-foreground/8` (unselected), `dark:hover:bg-foreground/15` (hover), `dark:bg-foreground/20` (selected).
  - Hover must also provide a visible dark-mode background change, not just a border change.
- [ ] Rework feedback answer card boundaries (`components/question/feedback.tsx`) — wrong-answer cards use `border-border/60 bg-background/50` which is ~1.1:1 in dark mode (invisible). Must add dark overrides.
- [ ] Rework review/dashboard/history row boundary strategy where rows are primary navigation targets.
- [ ] Rework low-contrast required boundaries in feedback callouts and action controls where the boundary is needed to identify state or action.

### 4) Component-level remediation scope

- [ ] Question flow surfaces:
  - `components/question/choice-button.tsx`
  - `components/question/feedback.tsx`
  - `components/markdown/Markdown.tsx`
  - `app/(app)/app/questions/[slug]/question-page-client.tsx` — also has `border-warning/50 bg-warning/5` pattern
- [ ] Dashboard/history/bookmarks surfaces:
  - `app/(app)/app/dashboard/page.tsx`
  - `app/(app)/app/bookmarks/page.tsx`
  - `app/(app)/app/history/history-page-client.tsx` — history subtitle uses `text-muted-foreground` on page background
  - `app/(app)/app/history/components/history-tab-bar.tsx` — inactive tab text uses `tabSwitchItemInactiveClasses`
  - `app/(app)/app/history/components/history-sessions-tab.tsx` — session rows use `border-border/60 bg-muted/20` on page bg; caption/mode filter use muted text; expanded panel uses `border-border/30`; "View breakdown" uses outline button border on dark row background
  - `app/(app)/app/history/components/history-questions-tab.tsx`
  - `app/(app)/app/shared/components/session-breakdown-list.tsx` — uses `text-muted-foreground/60` (~2.2:1, worse than V3 base) and `divide-border/20` dividers
- [ ] Navigation surfaces:
  - `components/app-desktop-nav.tsx` — inactive links use `text-muted-foreground` on page bg
  - `components/mobile-nav.tsx` — inactive links use `text-muted-foreground`, hamburger icon same; hover uses `bg-muted/50`
  - `components/auth-nav.tsx` — authenticated primary link uses `text-muted-foreground` on page bg
- [ ] Practice surfaces:
  - `app/(app)/app/practice/components/practice-session-starter.tsx` — `border-border/60 bg-muted/20` on tag filter containers, multiple `text-muted-foreground` at `text-xs`/`text-sm`
  - `app/(app)/app/practice/practice-page-client.tsx` — header action link ("Back to Dashboard") consumes `text-muted-foreground` via shared styles
  - `app/(app)/app/practice/components/practice-view.tsx` — empty/error cards render `text-sm text-muted-foreground`
  - `app/(app)/app/practice/components/incomplete-session-card.tsx` — metadata text uses `text-sm text-muted-foreground`
  - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — fallback card uses `text-sm text-muted-foreground`
  - `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` — summary labels use `text-xs text-muted-foreground`
  - `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` — summary metadata uses `text-sm text-muted-foreground`
- [ ] Error/notification surfaces:
  - `components/error-card.tsx` — `border-destructive/30 bg-destructive/10`
  - `components/ui/notification-provider.tsx` — toast borders at `border-success/30`, `border-destructive/40`
  - `app/(app)/app/layout.tsx` — PastDueBanner uses `bg-warning/10` + `text-warning-foreground` (BS-042 computes ~1.03:1 in dark mode; severe `SC 1.4.3` failure)
  - `app/(app)/app/billing/page.tsx` — warning card also uses `text-warning-foreground` on warning tint
  - `app/global-error.tsx` and `components/error-boundary-page.tsx` — `text-sm`/`text-xs text-muted-foreground` in failure surfaces
- [ ] Shared UI primitives:
  - `components/ui/button.tsx` — outline variant uses `dark:bg-input/30 dark:border-input`
  - `components/ui/card.tsx`
  - `components/ui/tab-switch-styles.ts` — inactive items use `text-muted-foreground hover:bg-muted/50`
  - `components/ui/segmented-control.tsx` — consumes `tab-switch-styles` constants
  - `components/ui/filter-chip.tsx` — unselected chips use `text-muted-foreground hover:bg-muted/50`
  - `components/ui/input.tsx` — `dark:bg-input/30 border-input placeholder:text-muted-foreground`
  - `components/ui/select.tsx` — `border-input` + placeholder/icon `text-muted-foreground` in `text-sm`/`text-xs` contexts
  - `components/ui/alert-dialog.tsx` — description copy uses `text-sm text-muted-foreground`
  - `components/ui/dropdown-menu.tsx` — label/shortcut text uses `text-muted-foreground` at `text-xs`/`text-sm`
  - `lib/shared-styles.ts` — `headerActionLinkClasses` currently sets `text-muted-foreground` for app header action links
- [ ] Auth/system entry surfaces:
  - `app/not-found.tsx` — secondary copy uses `text-muted-foreground`
  - `app/sign-in/[[...sign-in]]/sign-in-page-client.tsx` and `app/sign-up/[[...sign-up]]/sign-up-page-client.tsx` — loading/subtitle copy uses `text-muted-foreground`
- [ ] Non-app surfaces discovered by grep (track separately if intentionally deferred):
  - `app/pricing/pricing-view.tsx`
  - `app/(marketing)/checkout/success/checkout-success-sync.tsx`
  - `components/marketing/marketing-layout.tsx`
  - `components/marketing/marketing-home.tsx`

### 5) Verification and regression safety

- [ ] Extend existing contrast/token test suites:
  - `components/theme-token-regression.test.tsx` — semantic token regression suite; extend with contrast assertions for new token values
  - `components/ui/tab-switch-styles.test.ts` — already validates tab containers avoid `bg-muted/20` and `border-border/60`; extend if tab-switch tokens change
  - `tests/e2e/marketing-contrast.spec.ts` — E2E WCAG luminance math on marketing pages; consider extending pattern to app surfaces
- [ ] Add or update deterministic contrast checks (token-level math) for key semantic pairs in both themes.
- [ ] Update affected snapshot/string assertions in existing tests when class contracts change.
- [ ] Manually verify key journeys in dark and light themes:
  - question submit/review
  - dashboard
  - bookmarks
  - history tabs + mode filter + session count caption ("Showing X–Y…")
  - practice setup (segmented controls, filter chips, tag filters)
  - navigation (desktop and mobile, inactive link contrast)

## Acceptance Criteria

- [ ] All informational text in remediated surfaces meets `SC 1.4.3` AA:
  - normal text >= 4.5:1
  - large text >= 3.0:1
- [ ] All required UI boundaries/state indicators in remediated surfaces meet `SC 1.4.11` AA:
  - non-text contrast >= 3.0:1
- [ ] Any remaining exceptions are explicitly documented as temporary in `docs/frontend/standards.md` Section 17 with rationale and follow-up debt item.
- [ ] `docs/frontend/pattern-registry.md` and `docs/frontend/contrast-policy.md` are consistent after implementation.
- [ ] `docs/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md` reflects post-fix measurements and no stale pre-fix claims.

## Delivery Strategy

Implement in small PRs to reduce regression risk:

1. Token + text contrast first (`--muted-foreground` and direct text violations, including `text-muted-foreground/60` in session-breakdown-list)
2. Choice/button boundary fixes (highest UX impact)
3. Feedback and callout boundaries
4. Dashboard/history/bookmarks boundary parity
5. Navigation + practice + error/toast surface parity
6. Final audit pass + docs sync

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Over-correcting contrast harms hierarchy and visual calm | Validate against policy and design principles together; prefer minimal targeted changes and measured deltas |
| Token change causes broad visual drift | Land token updates with targeted component snapshots and visual checks in both themes |
| SC 1.4.11 scope confusion causes churn | Use `contrast-policy.md` definitions for required boundary vs decorative separator before class changes |
| Fixes regress recently shipped UI work | Ship in small PR slices and re-run affected tests per slice |
| **Uniform fill destroys state hierarchy (MATERIALIZED)** | **Always use stepped fill opacities per state; see "Key design principle" above** |

---

## PR #174 Implementation Findings

PR #174 (`debt-279/wcag-aa-contrast-remediation` → `main`) implemented delivery slices 1-3 but introduced a visual regression and left gaps. Findings documented here to inform the fix commit.

### Finding 1: Choice button fill hierarchy destroyed (REGRESSION)

**Severity:** High (UX regression — all choice states look identical in dark mode)

The agent applied `dark:bg-foreground/40` uniformly to both the base state (line 33) and the selected state (line 42) of `choice-button.tsx`. In dark mode, every choice button — unselected, hovered, and selected — renders as the same `#6a6a6a` medium gray block. The user cannot distinguish which choice is selected or being hovered.

**Pre-DEBT-279 state (working):**
| State | Background | Result |
|-------|-----------|--------|
| Unselected | `bg-muted/20` | Very subtle tint |
| Hover | `hover:bg-muted/40` | Visible 2x opacity jump |
| Selected | `bg-muted/40` + `border-ring` | Tinted + ring border |

**Post-DEBT-279 state (broken):**
| State | Dark Background | Dark Border |
|-------|----------------|-------------|
| Unselected | `dark:bg-foreground/40` | `dark:border-foreground/40` |
| Hover | `dark:bg-foreground/40` (**same**) | `dark:hover:border-foreground/70` |
| Selected | `dark:bg-foreground/40` (**same**) | `dark:border-foreground/70` |

**Required fix — stepped fills:**
| State | Dark Fill | Dark Border |
|-------|----------|-------------|
| Unselected | `dark:bg-foreground/8` | `dark:border-foreground/40` |
| Hover | `dark:hover:bg-foreground/15` | `dark:hover:border-foreground/70` |
| Selected | `dark:bg-foreground/20` | `dark:border-foreground/70` |

**Root cause:** The spec said "without losing hierarchy" (Section 3) and warned "over-correcting contrast harms hierarchy" (Risks). The implementing agent ignored both constraints by applying the same fill opacity to all states.

### Finding 2: Feedback answer cards have no dark-mode boundary treatment

**Severity:** Medium (neutral feedback boundaries still invisible in dark mode; same low-contrast pattern family as the pre-fix question surfaces)

`components/question/feedback.tsx` was only touched partially by PR #174. The pass strengthened the success/destructive containment cards, but it left the neutral wrong-answer cards and reference separator on the same low-contrast gray pattern family. The wrong-answer cards still use:

```
border-border/60 bg-background/50   ← ~1.1:1 border contrast in dark mode (invisible)
```

These need the same dark-mode border override strategy as choice buttons:
```
dark:border-foreground/40            ← 3.6:1 (passes SC 1.4.11)
```

The reference section separator (`border-border/40`) is even worse (~1.06:1). The wrong-answer choice text uses `text-muted-foreground` which may fail SC 1.4.3 depending on the final `--muted-foreground` token value.

### Finding 3: Cascade masking on verdict states (FIXED in c0cf64d1)

The unconditional `dark:border-foreground/40` on line 33 was applied regardless of verdict state. In Tailwind v4, dark variants appear later in generated CSS (~position 60000) than base utilities (~position 24000). Since `@media` doesn't add specificity, the dark override would mask `border-success` and `border-destructive` in dark mode.

**Fix applied:** Gated dark overrides behind `!hasVerdict` (`const hasVerdict = correctness === 'correct' || correctness === 'incorrect'`). Covered by test.

### Finding 4: Canonical docs drifted from the intended question-flow fix (RESOLVED)

**Severity:** Medium (process regression — future agents will copy the wrong pattern)

The canonical frontend docs did not agree on the question-flow styling target prior to this docs pass:

- `docs/frontend/pattern-registry.md` described the regressed choice-button dark fill as `dark:bg-foreground/40` in base and selected states.
- `docs/frontend/standards.md` summarized direct-action hover guidance with a stale `hover:bg-muted/60` shorthand.
- The registry did not define explicit feedback answer-card/reference-section patterns, even though `Feedback` is a separate code path from `ChoiceButton`.

**Fix applied:** Pattern Registry I-3 now specifies stepped fills (`8` → `15` → `20`). Standards.md hover table now references component-specific entries. New F-5/F-6/F-7 entries added for feedback patterns. F-5 and F-6 mark their dark-mode overrides as "not yet implemented" until the code fix lands.

### Component reuse analysis

ChoiceButton (pre-submission) and feedback answer cards (post-submission) are **entirely separate implementations** with no shared components or classes:

| | ChoiceButton | Feedback cards |
|---|---|---|
| Element | `<label>` (interactive) | `<div>` (display-only) |
| Padding | `p-4` | `p-3` |
| Badge | Circular `h-7 w-7 rounded-full` | Inline text "A)" |
| Layout gap | `gap-3` | `gap-1` |
| Dark overrides | Yes (PR #174) | **None** |

The interaction models are too different to share a component (label+radio vs static div), but the **dark-mode boundary token strategy** (`dark:border-foreground/40` for borders, stepped fills for hierarchy) should be applied consistently to both.
