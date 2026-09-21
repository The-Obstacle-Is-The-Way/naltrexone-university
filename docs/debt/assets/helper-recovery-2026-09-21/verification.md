# DEBT-475 — expose visible helper errors

## Property and scope

An ordinary successful E2E attempt must not hide a first-question error by
clicking Try again, or a bookmarks-page error by revisiting the page. Explicit
recovery-behavior tests may still exercise the product's recovery UI themselves.
This change is limited to the two recovery loops identified in DEBT-475.

Base content: `68608edc`; main promotion ancestry `4cd9d442` is included on the
feature branch without changing that base content. No `app/**` file changes.

## Red before implementation

2026-09-21 01:23 UTC:

```text
pnpm exec vitest run tests/e2e/helpers/session.test.ts tests/e2e/helpers/bookmark.test.ts
Test Files  2 failed (2)
Tests       3 failed | 32 passed (35)
```

- First-question error followed by successful Try again: rejection assertion
  failed because the old helper resolved `undefined`.
- Bookmarks states `error`, then `populated`: rejection assertion failed because
  the old helper resolved `undefined` after a second visit.
- Persistent bookmarks error: the old helper waited for three visits rather
  than rejecting the first error; the new first-error assertion failed.

The first two fixtures can recover. They are not constructed to fail regardless
of whether the helper retries. Reintroducing either old loop makes the same
rejection assertion fail.

## Green

After removing the loops, the identical command passed **35/35 in 2 files**.
Both regression fixtures assert that no recovery click/revisit occurred. Existing
normal session progress, diagnostics, page-state detection, and empty-bookmark
creation cases remain. First-question diagnostics reuse the existing credential
and provider-identifier redactor.

No retry configuration, test skip, floor, allowlist, application behavior, or
provider interaction is added by the fix. Full gate, hosted CI, exact-head review,
and promotion are separately required; this focused result does not claim them.
