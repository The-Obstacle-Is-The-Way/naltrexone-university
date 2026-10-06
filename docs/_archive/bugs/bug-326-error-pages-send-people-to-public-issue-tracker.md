# BUG-326: Error Pages Send Learners and Payers to the Public GitHub Issue Tracker

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-06: the fix is in production
**Priority:** P3
**Date:** 2026-10-05 (found); filed 2026-10-06
**Resolved:** 2026-10-06
**Verification receipts:** #1400 merged `5dcbbd9b` after exact-head approval 5427874840 on `925197bb` (local full gate passed on that head); promotion #1403 merged `d5236183`: main CI 37478735477 `test` passed, production assigned 2026-10-06T14:38:59.425Z, healthy production.

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

## Progress

**2026-10-06, the fix.** Tests were written red first.
- **`lib/support.ts`** exports `SUPPORT_EMAIL` and `supportMailtoHref({ page, errorId })`. The link is `mailto:` to support, with the subject "Addiction Boards support: <page>", plus "(error ID <digest>)" when the error has one. `REPORT_ISSUE_URL` is gone.
- **Every route error page** (`components/error-boundary-page.tsx`) **and the global error page** (`app/global-error.tsx`) show "Contact support" with that link, in place of "Report issue" opening a GitHub issue in a new tab.
- **Tests** check both pages' link, with and without an error ID, and that neither page mentions GitHub. The browser spec checks the link.
- **Docs.** The frontend standards and the practice-engine overview name the new button.

## Verification

- [x] Tests, red first: every error page's report link is a `mailto:` to the support address, carries the error ID when the error has one, and never points at GitHub.
- [x] The copy reads as contacting support, not filing an issue.
- [x] The fix reaches production: promotion #1403, assigned 2026-10-06T14:38:59.425Z.

## Related

- [BUG-319](../../bugs/bug-319-subscribe-actions-break-after-a-deploy.md): the error pages this button sits on.
