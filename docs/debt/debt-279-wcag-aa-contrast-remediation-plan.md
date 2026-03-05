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

### 2) Token-level remediation

- [ ] Raise dark-mode `--muted-foreground` from 45% to a value that passes all sampled normal-text contexts from BS-042.
- [ ] Validate candidate token against at least these backgrounds in dark mode:
  - card (`--card`)
  - row fill (`bg-muted/20` over card)
  - feedback wrong card (`bg-background/50` over card)
  - feedback success card (`bg-success/5` over card)
- [ ] Recompute and document resulting text ratios in BS-042.

### 3) Required-boundary remediation (SC 1.4.11)

- [ ] Fix required interactive boundaries that currently rely on `border-border/60 bg-muted/20` where boundaries are not perceivable enough.
- [ ] Rework choice button base/hover/selected boundary strategy (`components/question/choice-button.tsx`) to meet policy without losing hierarchy.
- [ ] Rework review/dashboard/history row boundary strategy where rows are primary navigation targets.
- [ ] Rework low-contrast required boundaries in feedback callouts and action controls where the boundary is needed to identify state or action.

### 4) Component-level remediation scope

- [ ] Question flow surfaces:
  - `components/question/choice-button.tsx`
  - `components/question/feedback.tsx`
  - `components/markdown/Markdown.tsx`
  - `app/(app)/app/questions/[slug]/question-page-client.tsx`
- [ ] Dashboard/history/bookmarks surfaces:
  - `app/(app)/app/dashboard/page.tsx`
  - `app/(app)/app/bookmarks/page.tsx`
  - `app/(app)/app/history/components/history-sessions-tab.tsx`
  - `app/(app)/app/history/components/history-questions-tab.tsx`
- [ ] Shared UI primitives where needed:
  - `components/ui/button.tsx`
  - `components/ui/card.tsx`

### 5) Verification and regression safety

- [ ] Add or update deterministic contrast checks (token-level math) for key semantic pairs in both themes.
- [ ] Update affected snapshot/string assertions in existing tests when class contracts change.
- [ ] Manually verify key journeys in dark and light themes:
  - question submit/review
  - dashboard
  - bookmarks
  - history tabs

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

1. Token + text contrast first (`--muted-foreground` and direct text violations)
2. Choice/button boundary fixes (highest UX impact)
3. Feedback and callout boundaries
4. Dashboard/history/bookmarks boundary parity
5. Final audit pass + docs sync

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Over-correcting contrast harms hierarchy and visual calm | Validate against policy and design principles together; prefer minimal targeted changes and measured deltas |
| Token change causes broad visual drift | Land token updates with targeted component snapshots and visual checks in both themes |
| SC 1.4.11 scope confusion causes churn | Use `contrast-policy.md` definitions for required boundary vs decorative separator before class changes |
| Fixes regress recently shipped UI work | Ship in small PR slices and re-run affected tests per slice |

