# DEBT-499: A Sentry Major Would Widen What We Send to Sentry, and Nothing Pins It

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the upgrade with an explicit restrictive `dataCollection` is written and tested (2026-10-05); the record closes once it is on `main` ([Progress](#progress))
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Dependabot opened #1369 on 2026-10-05, bumping `@sentry/nextjs` from 10.75.1 to 11.0.0, and its CI passed. Sentry v11 replaces `sendDefaultPii` with `dataCollection`. Sentry's migration guide warns that this is "a behavior change, not just a renamed option": in v10, leaving `sendDefaultPii` unset was restrictive, but in v11, leaving `dataCollection` unset "collects the categories below **by default**".

None of our three `Sentry.init` calls set either option. They rely on v10's restrictive default, so merging #1369 would start sending Sentry:
- cookies, including Clerk's refresh-token and handshake cookies;
- user information and IP addresses;
- every request and response body;
- request and response headers without v10's PII scrubbing;
- database query data.

No test pins what we send, so nothing failed.

## Evidence

- **Sentry's migration guide**, `MIGRATION.md` on `develop`, section "`sendDefaultPii` is replaced by `dataCollection`", read on 2026-10-05:

  | Category | v10 default (`sendDefaultPii` off) | v11 default |
  | --- | --- | --- |
  | `userInfo` | `false` | `true` |
  | `cookies` | not collected | `true` |
  | `httpHeaders` | request and response, PII scrubbed | request and response |
  | `httpBodies` | not collected (size only) | all request and response |
  | `databaseQueryData` | `false` | `true` |
  | `genAI`, `queues` | not collected | collected |

  It continues: "**Don't leave `dataCollection` unset** — that now enables broader collection", and gives the explicit settings that preserve the v10 default.
- **Our configuration.** `instrumentation.ts` (node and edge runtimes) and `sentry.client.config.ts`, which `instrumentation-client.ts` imports, set `dsn`, `environment` and sample rates only. `sentry-config.test.ts` checks the DSN, the environment and the sample rates, but no data-collection setting.
- **Our published privacy policy** (`app/(marketing)/privacy/privacy-content.ts`) lists what Sentry receives:
  - errors and stack traces;
  - page, route and request context;
  - browser and device information;
  - narrow trace attributes.

  It names neither cookies, full request or response bodies, nor database queries. v11's default would exceed it.
- **Which cookies Sentry's own filter would still catch.** v11 always replaces with `[Filtered]` the value of any key whose name contains one of its sensitive snippets: `auth`, `token`, `session`, `jwt`, `cookie`, `sid`, `nonce` and others. That list is in `@sentry/core`'s `filtering-snippets.js`, version 11.0.0. Checked against the cookie names in the installed Clerk SDK (`@clerk/backend` 3.18.1):

  | Cookie | Under v11's default |
  | --- | --- |
  | `__session` (session token) | filtered |
  | `__clerk_db_jwt`, `__dev_session` (development) | filtered |
  | `__clerk_handshake_nonce` | filtered |
  | `__refresh` (Clerk's refresh token) | **sent in clear** |
  | `__clerk_handshake` (the signed session handoff) | **sent in clear** |
  | `__client_uat`, `__clerk_redirect_count`, `__clerk_synced` | sent; not credentials |

  The session token itself would be filtered, but two credential carriers would not.
- **Other v11 changes, checked against our use.** We call only `init`, `captureException`, `captureRequestError` and `startSpan`, and our spans carry attributes, not scope tags.
  - Node ≥20.19, Next.js ≥14 and TypeScript ≥5.0.4: all met.
  - Span streaming is on by default.
  - `ignoreTransactions` and `beforeSendTransaction` no longer take effect. We use neither.

## Impact

Merging a green Dependabot PR would send Clerk's refresh-token and handshake cookies, learners' request bodies, and database query parameters and results to a third party. That breaches the privacy policy and creates a credential exposure. Compare BUG-307's leak of session tokens into CI logs.

## Options

1. **Merge #1369 as-is.** Rejected: the widening above.
2. **Stay on v10 and ignore the major.** Rejected: v10 stops receiving fixes, and the next upgrade meets the same trap with no test to catch it.
3. **Upgrade in our own PR with an explicit restrictive `dataCollection` on every runtime, and pin it with a test.** Recommended. The settings are at least as strict as v10's default:
   - no user info, cookies, request or response bodies, GenAI content, database query data or queues;
   - headers and URL query parameters deny forwarding and IP headers, as Sentry's v10-equivalent example does;
   - also deny Clerk's handshake and development-session parameters, which carry tokens.

## Resolution (decided)

Option 3, under the owner's 2026-09-28 delegation.
1. One shared, frozen `dataCollection` constant goes to every `Sentry.init`: server, edge and client.
2. `sentry-config.test.ts` asserts that each runtime's `init` receives exactly that constant, and that the constant disables each category above. A future major that renames or widens an option then fails a test before merge.
3. `@sentry/nextjs` moves to 11 in that PR. #1369 is closed as superseded, with a link to it.
4. The privacy policy needs no change, since collection stays within what it lists. Its Sentry row is re-checked against the final settings.

## Progress

**The upgrade, 2026-10-05.**
- **Version.** `@sentry/nextjs` moves to `^11.0.0`, the version #1369 proposed. The repository's seven-day minimum release age held back later 11.x releases. The lockfile changes only inside Sentry's dependency tree: OpenTelemetry packages out, the oxc parser in, and Babel. The `rollup` version `dev` already had is kept.
- **`lib/sentry-data-collection.ts`** exports `SENTRY_DATA_COLLECTION`, which every `Sentry.init` receives (`instrumentation.ts` for node and edge, and `sentry.client.config.ts`, which `instrumentation-client.ts` imports). It sets:
  - no user info, cookies, request or response bodies, database query data or queue arguments;
  - no GenAI or GraphQL content;
  - deny lists on request headers, response headers and URL query parameters.
- **The deny lists.** Sentry matches deny terms as case-insensitive substrings, and always filters keys containing `auth`, `token`, `session`, `jwt` or `cookie`. The lists add two groups:
  - v10's forwarding and IP terms (`forwarded`, `-ip`, `remote-`, `via`, `-user`);
  - two credential carriers that Sentry's own list misses: `__clerk` (Clerk's handshake and development-session parameters) and `signature` (Stripe and Svix webhook signature headers).
- **Tests.**
  - `sentry-config.test.ts` asserts that each runtime's `init` receives exactly the constant.
  - `lib/sentry-data-collection.test.ts` asserts each category's setting.
- **The SDK import boundary gains this module.** Biome's `noRestrictedImports` limits `@sentry/nextjs` to the tracing wrapper and the SDK configuration files. `lib/sentry-data-collection.ts` is SDK configuration, and it imports only the SDK's types, so it joins the override. `tests/server-tracing-import-policy.test.ts` pins it, red first.
- **Compile-time guard.** A check in the module fails typecheck if Sentry adds a category the constant does not set. Only the two stack-frame settings stay at Sentry's defaults, as in v10.
- **Evidence.**
  - The wiring tests were red first.
  - Seven targeted mutations each fail a check: dropping either runtime's wiring, enabling cookies or bodies, dropping the Clerk term, opening response headers, and omitting a category, which fails typecheck.
- **The privacy policy needs no change.** Its Sentry row lists errors, stack traces, route and request context, browser and device information, and narrow trace attributes, and collection stays within that.

## Verification

Criteria to meet before closing.

- [x] Every `Sentry.init` receives the shared restrictive `dataCollection`, and a test fails if any runtime omits it or widens a category. The type-level guard also covers new categories.
- [ ] `@sentry/nextjs` is on v11, and the full gate passes.
- [ ] The production build's Sentry initialization is unchanged in sample rates and environment.
- [ ] #1369 is closed as superseded.

## Related

- Dependabot #1369, and the "do not merge" comment of 2026-10-05.
- BUG-307 (archived): session tokens in CI logs.
- `app/(marketing)/privacy/privacy-content.ts`: the Sentry row.
