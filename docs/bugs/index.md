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
| [BUG-009](./bug-009-vercel-preview-deployment-rate-limit.md) | Vercel Preview Deployment Status Fails Due to Rate Limit | Won't Fix | P3 | 2026-02-01 |

**Next Bug ID:** BUG-014

## Archived Bugs

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
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
