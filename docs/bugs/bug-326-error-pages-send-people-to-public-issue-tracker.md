# BUG-326: Error Pages Send Learners and Payers to the Public GitHub Issue Tracker

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the fix is in this pull request
**Priority:** P3
**Date:** 2026-10-05 (found); filed 2026-10-06
**Resolved:** —
**Verification receipts:** —

---

## Summary

Every error page, and the global error page, offers a "Report issue" button. It opens a new issue on this repository's public GitHub tracker. That covers the pricing, billing and checkout-success error pages too.

So a person whose payment just failed is invited to describe it in public, under a GitHub identity. A learner without a GitHub account gets no support route from the page at all. GitHub is not named among the providers in the privacy policy. The policy gives support@addictionboards.com as the contact for questions and requests.

## Evidence

- `lib/support.ts:1-2`: `REPORT_ISSUE_URL` is `https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/new`.
- It is used by `components/error-boundary-page.tsx` (every route error page) and `app/global-error.tsx`.
- `app/(marketing)/privacy/privacy-content.ts:16,113,143` names support@addictionboards.com. Its provider table (`:67`) lists ImprovMX for support mail, and not GitHub.
- DEBT-100 (archived) added the link in February 2026, before the product took payments.

## Options

1. **Email support:** `mailto:support@addictionboards.com`, with a subject naming the page and, when present, the error ID (the digest).
2. **A support page** with a form. More to build and to keep private.

## Resolution (decided)

Option 1. The address already exists, is the one the privacy policy names, and needs no new data processor. Including the error ID lets support find the server-side event without asking the person for details.

## Verification

Criteria to meet before closing; none is met yet.

- [ ] Tests, red first: every error page's report link is a `mailto:` to the support address, carries the error ID when the error has one, and never points at GitHub.
- [ ] The copy reads as contacting support, not filing an issue.

## Related

- [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md): the error pages this button sits on.
