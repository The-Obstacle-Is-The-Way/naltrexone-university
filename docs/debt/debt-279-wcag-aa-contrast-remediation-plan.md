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
  - muted surface (`bg-muted`) — segmented-control/tab-switch containers
  - row fill (`bg-muted/20` over card)
  - row fill (`bg-muted/20` over page background) — history session rows
  - feedback wrong card (`bg-background/50` over card)
  - feedback success card (`bg-success/5` over card)
  - page background (`--background`) — for nav links, page-level labels
  - hover fills (`bg-muted/50` over card) — for filter chips, mobile nav, inactive tabs
  - warning tint (`bg-warning/10` over page background) — for warning copy surfaces (for example, PastDueBanner)
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
- [ ] Error/notification surfaces:
  - `components/error-card.tsx` — `border-destructive/30 bg-destructive/10`
  - `components/ui/notification-provider.tsx` — toast borders at `border-success/30`, `border-destructive/40`
  - `app/(app)/app/layout.tsx` — PastDueBanner uses `bg-warning/10` + `text-warning-foreground` (BS-042 computes ~1.03:1 in dark mode; severe `SC 1.4.3` failure)
- [ ] Shared UI primitives:
  - `components/ui/button.tsx` — outline variant uses `dark:bg-input/30 dark:border-input`
  - `components/ui/card.tsx`
  - `components/ui/tab-switch-styles.ts` — inactive items use `text-muted-foreground hover:bg-muted/50`
  - `components/ui/segmented-control.tsx` — consumes `tab-switch-styles` constants
  - `components/ui/filter-chip.tsx` — unselected chips use `text-muted-foreground hover:bg-muted/50`
  - `components/ui/input.tsx` — `dark:bg-input/30 border-input placeholder:text-muted-foreground`
  - `lib/shared-styles.ts` — `headerActionLinkClasses` currently sets `text-muted-foreground` for app header action links

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
