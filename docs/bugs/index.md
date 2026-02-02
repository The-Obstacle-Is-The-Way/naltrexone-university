# Bug Reports

**Project:** Naltrexone University
**Last Updated:** 2026-02-02

---

## What are Bug Reports?

Bug reports document issues discovered in the codebase along with their root cause, fix, and verification. They serve as:

1. **Issue Tracking** — Formal record of what went wrong and how it was fixed
2. **Regression Prevention** — Ensure we don't reintroduce the same bugs
3. **Knowledge Base** — Help future developers understand past issues

## Bug Index (Active)

| ID | Title | Status | Priority | Date |
|----|-------|--------|----------|------|
| — | _None_ | — | — | — |

**Next Bug ID:** BUG-046

## Foundation Audit

A comprehensive vertical/horizontal trace of all critical paths was conducted on 2026-02-02.
See: [Foundation Audit Report](foundation-audit-report.md)

## Archived Bugs

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [BUG-045](../_archive/bugs/bug-045-checkout-missing-current-period-end.md) | Checkout Success Validation Fails — missing_current_period_end | P1 | 2026-02-02 |
| [BUG-044](../_archive/bugs/bug-044-checkout-success-stale-cache.md) | Checkout Success Page Serving Stale Code | P2 | 2026-02-02 |
| [BUG-043](../_archive/bugs/bug-043-checkout-success-not-public-route.md) | Checkout Success Route Not Public (Stripe Return) | P2 | 2026-02-02 |
| [BUG-041](../_archive/bugs/bug-041-webhook-subscription-created-missing-metadata.md) | Webhook 500 on customer.subscription.created (Missing metadata.user_id) | P2 | 2026-02-02 |
| [BUG-042](../_archive/bugs/bug-042-checkout-success-silent-validation-failure.md) | Checkout Success Redirects Without Diagnostics | P1 | 2026-02-02 |
| [BUG-040](../_archive/bugs/bug-040-clerk-key-mismatch-infinite-redirect.md) | Clerk Infinite Redirect Loop Warning (Key Mismatch) | P2 | 2026-02-02 |
| [BUG-039](../_archive/bugs/bug-039-checkout-success-searchparams-not-awaited.md) | Checkout Success Page Crashes — searchParams Not Awaited | P1 | 2026-02-02 |
| [BUG-028](../_archive/bugs/bug-028-inconsistent-cascade-delete-attempts.md) | Inconsistent Cascade Delete for Attempts | P2 | 2026-02-02 |
| [BUG-024](../_archive/bugs/bug-024-entitlement-race-condition-past-due.md) | Entitlement Race Condition During Payment Failure | P2 | 2026-02-02 |
| [BUG-016](../_archive/bugs/bug-016-memory-exhaustion-power-users.md) | Memory Exhaustion for Power Users — All Attempts Loaded Into Memory | P1 | 2026-02-02 |
| [BUG-023](../_archive/bugs/bug-023-missing-clerk-user-deletion-webhook.md) | Missing Clerk Webhook for User Deletion — Orphaned Data | P2 | 2026-02-02 |
| [BUG-019](../_archive/bugs/bug-019-missing-bookmarks-view-page.md) | Missing Bookmarks View Page — Users Can Bookmark But Can't View | P2 | 2026-02-02 |
| [BUG-020](../_archive/bugs/bug-020-missing-review-missed-questions-page.md) | Missing Review/Missed Questions Page — Dead Controller Code | P2 | 2026-02-02 |
| [BUG-021](../_archive/bugs/bug-021-practice-sessions-never-started.md) | Practice Sessions Never Started/Ended — Dead Session Controller Code | P2 | 2026-02-02 |
| [BUG-025](../_archive/bugs/bug-025-missing-subscription-event-handlers.md) | Missing Subscription Event Handlers (paused/resumed) | P2 | 2026-02-02 |
| [BUG-026](../_archive/bugs/bug-026-concurrent-checkout-sessions.md) | No Protection Against Concurrent Checkout Sessions | P2 | 2026-02-02 |
| [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md) | Stripe Events Table Unbounded Growth | P2 | 2026-02-02 |
| [BUG-038](../_archive/bugs/bug-038-missing-clerk-user-updated-webhook.md) | Missing Clerk user.updated Webhook — Email Sync Gap | P3 | 2026-02-02 |
| [BUG-037](../_archive/bugs/bug-037-no-mobile-navigation-menu.md) | No Mobile Navigation Menu | P2 | 2026-02-02 |
| [BUG-036](../_archive/bugs/bug-036-no-loading-state-subscribe-buttons.md) | No Loading State on Subscribe Buttons | P2 | 2026-02-02 |
| [BUG-022](../_archive/bugs/bug-022-missing-loading-states-on-forms.md) | Missing Loading States on Form Buttons | P3 | 2026-02-02 |
| [BUG-018](../_archive/bugs/bug-018-silent-fallbacks-in-controllers.md) | Silent Fallbacks in Controllers — Data Inconsistency | P2 | 2026-02-02 |
| [BUG-017](../_archive/bugs/bug-017-billing-button-without-subscription.md) | Billing Page Shows "Manage in Stripe" When No Subscription | P2 | 2026-02-02 |
| [BUG-035](../_archive/bugs/bug-035-error-banner-not-clearable.md) | Error Banner Not Clearable on Pricing Page | P3 | 2026-02-02 |
| [BUG-034](../_archive/bugs/bug-034-webhook-error-context-lost.md) | Webhook Catch Block Loses Error Context | P2 | 2026-02-02 |
| [BUG-033](../_archive/bugs/bug-033-stale-closure-toggle-bookmark.md) | Stale Closure in onToggleBookmark — Wrong Question Bookmarked | P2 | 2026-02-02 |
| [BUG-032](../_archive/bugs/bug-032-state-update-after-unmount.md) | State Update After Component Unmount in Practice Page | P2 | 2026-02-02 |
| [BUG-031](../_archive/bugs/bug-031-non-unique-react-key-dashboard.md) | Non-Unique React Key in Dashboard Recent Activity | P3 | 2026-02-02 |
| [BUG-015](../_archive/bugs/bug-015-fragile-webhook-error-matching.md) | Fragile Webhook Error Matching Uses String Instead of Error Code | P1 | 2026-02-02 |
| [BUG-029](../_archive/bugs/bug-029-answer-choices-not-randomized.md) | Answer Choices Not Randomized — Test Validity Issue | P1 | 2026-02-02 |
| [BUG-030](../_archive/bugs/bug-030-time-spent-always-zero.md) | Time Spent Always Zero — No Timer Implementation | P1 | 2026-02-02 |
| [BUG-014](../_archive/bugs/bug-014-pricing-subscribe-action-not-working.md) | Pricing Subscribe Action Not Working (Server Action Serialization) | P1 | 2026-02-02 |
| [BUG-013](../_archive/bugs/bug-013-silent-error-handling.md) | Silent Error Handling — Errors Swallowed Without Logging or User Feedback | P1 | 2026-02-02 |
| [BUG-012](../_archive/bugs/bug-012-incomplete-feature-wiring.md) | Incomplete Feature Wiring — Missing Controllers and E2E Coverage | P2 | 2026-02-02 |
| [BUG-011](../_archive/bugs/bug-011-ux-flow-gaps-multiple-issues.md) | UX Flow Gaps — Multiple Navigation and Wiring Issues | P1 | 2026-02-02 |
| [BUG-010](../_archive/bugs/bug-010-database-not-seeded.md) | Database Not Seeded — No Questions Available | P1 | 2026-02-02 |
| [BUG-001](../_archive/bugs/bug-001-pnpm-s-vim-hang.md) | `pnpm -s …` Can Launch Vim and Hang | P2 | 2026-02-01 |
| [BUG-002](../_archive/bugs/bug-002-next-build-node-env-skip-clerk.md) | `NEXT_PUBLIC_SKIP_CLERK` blocked `next build` | P1 | 2026-02-01 |
| [BUG-003](../_archive/bugs/bug-003-fake-repo-throws-error-not-application-error.md) | FakePracticeSessionRepository throws Error | P0 | 2026-01-31 |
| [BUG-004](../_archive/bugs/bug-004-submit-answer-hardcoded-time-spent.md) | SubmitAnswer hardcodes timeSpentSeconds | P2 | 2026-01-31 |
| [BUG-005](../_archive/bugs/bug-005-auth-nav-dashboard-link-404.md) | Nav Links to Missing `/app/dashboard` | P2 | 2026-02-01 |
| [BUG-006](../_archive/bugs/bug-006-dark-mode-not-applied.md) | Dark Theme Not Applied | P4 | 2026-02-01 |
| [BUG-007](../_archive/bugs/bug-007-question-frontmatter-duplicate-tag-slugs.md) | Duplicate Tag Slugs in Frontmatter | P3 | 2026-02-01 |
| [BUG-008](../_archive/bugs/bug-008-stripe-webhook-endpoint-missing.md) | Stripe Webhook Endpoint Missing | P0 | 2026-02-01 |
| [BUG-009](../_archive/bugs/bug-009-vercel-preview-deployment-rate-limit.md) | Vercel Preview Deployment Status Fails Due to Rate Limit | P3 | 2026-02-01 |

## Bug Statuses

- **Open** — Bug confirmed, not yet fixed
- **In Progress** — Fix being developed
- **Resolved** — Fix merged and verified
- **Won't Fix** — Decided not to fix (with justification)

## Priority Levels

- **P0** — Critical: System broken, data loss, security issue
- **P1** — High: Major functionality broken
- **P2** — Medium: Feature degraded but workaround exists
- **P3** — Low: Minor issue, cosmetic
- **P4** — Trivial: Nice to have

---

## How to Report a New Bug

1. Create `bug-NNN-short-description.md` using the template below
2. Set status to "Open"
3. Assign priority based on impact
4. Submit PR for triage

## Bug Template

```markdown
# BUG-NNN: Short Title

**Status:** Open | In Progress | Resolved | Won't Fix
**Priority:** P0 | P1 | P2 | P3 | P4
**Date:** YYYY-MM-DD

---

## Description

What is the bug? What behavior is observed vs expected?

## Steps to Reproduce

1. ...
2. ...
3. ...

## Root Cause

Why did this happen? (Fill in after investigation)

## Fix

What was done to fix it? (Fill in after resolution)

## Verification

How was the fix verified?

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification

## Related

- Links to PRs, commits, related bugs/debt
```

---

## Archive

Resolved bugs are archived to `docs/_archive/bugs/` after verification.
