# DEBT-513: Error Text Reaches Sentry as Written

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — decided below; joins the quick-wins pull request
**Priority:** P3
**Date:** 2026-10-08
**Resolved:** —
**Verification receipts:** —

---

## Summary

`scrubEvent` redacts credential parameters in the URLs an error event carries: the request URL, its query string and the Next.js request path. [BUG-331](../bugs/bug-331-server-breadcrumbs-and-request-spans-carry-credentials.md) covers breadcrumbs, spans and envelope headers. The event's own text is sent as written: an exception's message (`exception.values[].value`), a linked cause's message, and a captured message. If that text embeds a URL with a credential parameter, Sentry receives it.

No leak has been seen. This is hardening, found while reviewing BUG-331 (#1430).

## Evidence

- **Our own errors.** Counted with the TypeScript parser over `src`, `app` and `lib`, tests excluded (2026-10-08):
  - **`ApplicationError`:** of 247 calls, 215 pass a fixed message, 25 interpolate a value, and 7 pass a computed one. The values are:
    - retry seconds;
    - internal IDs of questions, revisions, choices, attempts, practice sessions and subscriptions;
    - a Stripe price ID and a webhook event type;
    - a validation message;
    - the Stripe SDK's signature-verification message.
  - **`Error`:** of 28 calls, 8 interpolate an enum value, a content heading or an internal ID.
  - **Result:** none carries a credential. The IDs are pseudonymous.

  *Corrected 2026-10-08 (pre-review): a first, line-based count missed calls split across lines and reported every `ApplicationError` message as fixed.*
- **Other libraries' errors.** An error from Clerk, Stripe, `fetch` or Postgres that escapes uncaught carries that library's text. Stripe's messages name object IDs (for example "No such customer"); none of these libraries is known to put a credential in a message, but nothing here stops one.
- **Production.** On 2026-10-08, Sentry's server project held no issue yet (it began that day), and the web project's 7 issues of the last 14 days showed no credential parameter, Stripe or Clerk ID, email address or URL query in their titles, culprits or metadata (counts only).

## Options

1. **Redact the event's text.** Run `redactCredentialParams` over each exception value and the event message in `scrubEvent`. Since BUG-331, a pair ends at whitespace, so free text is matched safely. It keeps the text needed for diagnosis.
2. **Also mask IDs.** Internal and Stripe IDs do appear in messages (above). They are pseudonymous, diagnosis needs them, and Sentry receives no user to join them to, so they stay.
3. **Send error codes only.** It loses the text a diagnosis starts from.

## Resolution

**Decided:** option 1, test-first through the real SDK (an error whose message holds `?__clerk_handshake=…` and a cause holding `?code=…` reaches Sentry filtered), in the quick-wins pull request ([AUDIT-015](../audits/audit-015-register-audit-by-root-cause-2026-10-08.md), decided order item 2).

## Verification

- [ ] The real-SDK test fails before the change and passes after it.

## Related

- [BUG-331](../bugs/bug-331-server-breadcrumbs-and-request-spans-carry-credentials.md): the review that found it.
- [BUG-318](../_archive/bugs/bug-318-sentry-sends-credentials-on-server-error-events.md): the URL scrubbing it extends.
