# DEBT-499: Nothing Pins What We Send to Sentry, and a Green Major Would Change It

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the upgrade with explicit restrictive settings is written and tested (2026-10-05); the record closes once it is on `main` ([Progress](#progress))
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Dependabot opened #1369 on 2026-10-05, bumping `@sentry/nextjs` from 10.75.1 to 11.0.0, and its CI passed. Sentry v11 replaces `sendDefaultPii` with `dataCollection`, and its migration guide warns that leaving `dataCollection` unset "collects the categories below **by default**".

None of our `Sentry.init` calls sets either option, and no test pins what they send, so a green major could change what goes to a third party.

Checking that showed the current version is no better. Production already sends credentials on server error events, which is filed as [BUG-318](../bugs/bug-318-sentry-sends-credentials-on-server-error-events.md). This record covers the missing guard; BUG-318 covers the live exposure. One change fixes both.

## Evidence

- **Measured through the real SDK, 2026-10-05.** One `captureRequestError` call, our `onRequestError`, carried nine credential-bearing values, each generated at random for the run:
  - three Clerk cookies: `__session`, `__refresh` and `__clerk_handshake`;
  - a cron `Bearer` header;
  - Stripe and Svix signatures;
  - a `__clerk_handshake` query parameter;
  - the `x-prerender-revalidate` header;
  - an `x-forwarded-for` IP.

  A recording transport kept each envelope; nothing was sent.

  | Configuration | Values sent | Body capture |
  | --- | --- | --- |
  | 10.75.1 with `main`'s options (production today; BUG-318) | all 9 | on ("medium") |
  | 11.0.0 with no `dataCollection` (#1369 as-is) | 8: all but `__session` and the cron `Bearer` | on |
  | 11.0.0 with this record's settings | none | off |

  The 11.0.0 runs are `lib/sentry-data-collection-sdk.test.ts`, with and without the settings. The 10.75.1 run used an isolated install with install scripts disabled.
- **Sentry's migration guide** (`MIGRATION.md` on `develop`, read 2026-10-05) gives v10's default as "cookies: not collected" and "httpBodies: not collected (size only)". That holds for spans but not for error events in 10.75.1; see BUG-318's source references.
- **Sentry's own filter.** v11 always replaces with `[Filtered]` the value of a key whose name contains one of its sensitive snippets: `auth`, `token`, `session`, `jwt`, `cookie`, `sid`, `nonce` and others (`@sentry/core` 11.0.0, `filtering-snippets.js`). Checked against the cookie names in the installed Clerk SDK (`@clerk/backend` 3.18.1), with suffixed variants such as `__session_<suffix>` matching as their base name:

  | Clerk cookie | Under v11 with `cookies` unset |
  | --- | --- |
  | `__session` (session token) | filtered |
  | `__clerk_db_jwt` (development) | filtered |
  | `__clerk_handshake_nonce` | filtered |
  | `__refresh` (refresh token) | **sent in clear** |
  | `__clerk_handshake` (signed session handoff) | **sent in clear** |
  | `__client_uat`, `__clerk_redirect_count` | sent; not credentials |

  `__dev_session` and `__clerk_synced` are query parameters in that SDK, not cookies.
- **URLs outside the query-string field.** v11's `urlQueryParams` filter covers the request's query string, but not:
  - the Next.js request path (`contexts.nextjs.request_path`);
  - URL-valued headers (`referer`, Clerk's `x-clerk-clerk-url`);
  - a browser event's URL;
  - breadcrumb URLs.

  Clerk's development instances append `__clerk_db_jwt` to their API URLs.
- **Our configuration** before this change set `dsn`, `environment` and sample rates only. `sentry-config.test.ts` checked those and no data-collection setting.
- **The privacy policy's Sentry row** (`app/(marketing)/privacy/privacy-content.ts`) lists errors, stack traces, page, route and request context, browser and device information, and narrow trace attributes. It does not list credentials or request bodies.
- **Other v11 changes, checked against our use.**
  - We call only `init`, `captureException`, `captureRequestError` and `startSpan`. Our spans carry attributes, not scope tags.
  - Node 24, Next.js 16 and TypeScript are within v11's minimums.
  - There is no `withSentryConfig` build step, so v11's database instrumentation, which needs build-time injection, is not active.
  - `includeLocalVariables` is unset, so stack frames carry no local variables in either version.
  - `frameContextLines` defaults to 5 in v11, down from 7 in v10.
  - Span streaming becomes the default.

## Impact

See BUG-318 for the live exposure. Without a pinned setting, every Sentry major is an unreviewed change to what leaves the app.

## Options

1. **Merge #1369 as-is.** Rejected: it keeps eight of the nine values flowing.
2. **Stay on v10.** Rejected: v10 is the live exposure, and stops receiving fixes.
3. **Upgrade in our own PR, with explicit restrictive settings on every runtime, scrubbers for URLs, and a test through the real SDK.** Recommended.

## Resolution (decided)

Option 3, under the owner's 2026-09-28 delegation:
1. One shared `dataCollection` constant goes to every `Sentry.init`, together with `beforeSend` and `beforeBreadcrumb` scrubbers.
2. Tests pin the wiring on every runtime, and the real SDK proves the outcome.
3. A type-level check fails if Sentry adds a category, top-level or nested, that the constant does not set.
4. `@sentry/nextjs` moves to 11 here, and #1369 is closed as superseded.
5. The privacy policy needs no change, since what is sent stays within its Sentry row.

## Progress

**The upgrade, 2026-10-05.**
- **Version.** `@sentry/nextjs` moves to `^11.0.0`, the version #1369 proposed; the repository's seven-day minimum release age held back later 11.x releases.
- **Lockfile.** It changes only inside Sentry's tree: OpenTelemetry packages and webpack out, the oxc parser in, and Babel.
- **Configuration and licence.**
  - `pnpm-workspace.yaml` drops the three `@opentelemetry/*` overrides, which no package uses now, and the `@sentry/cli` build permission, since that package is gone.
  - `docs/dev/license-baseline.md` records `sentry` 0.44.1 (FSL-1.1-Apache-2.0), Sentry's new CLI, in place of `@sentry/cli` (FSL-1.1-MIT).
- **`lib/sentry-data-collection.ts`** holds what every runtime may send (`instrumentation.ts` for node and edge, and `sentry.client.config.ts`):
  - `SENTRY_DATA_COLLECTION`:
    - no user info, cookies, request or response bodies, database query data or queue arguments;
    - no GenAI or GraphQL content;
    - deny lists on request headers, response headers and URL query parameters.
  - **The deny lists add** v10's forwarding and IP terms (`forwarded`, `-ip`, `remote-`, `via`, `-user`) and the carriers Sentry's own list misses:
    - `__clerk`, Clerk's parameters;
    - `x-clerk`, Clerk's headers, one of which holds the full request URL;
    - `signature`, the Stripe and Svix webhook headers;
    - `referer`;
    - `prerender`, Next.js's prerender bypass header;
    - `proxied`, Vercel's proxied-for address.
  - **`scrubEvent` and `scrubBreadcrumb`** redact the values of credential-bearing query parameters in the URLs the SDK's filters do not reach. The redaction never throws on a parameter name that is not valid URL encoding: a throw in `beforeSend` would lose the event. A test pins this, from CodeRabbit's review of #1373.
- **The SDK import boundary.** Biome's `noRestrictedImports` limits `@sentry/nextjs` to the tracing wrapper and the SDK configuration files. The module and its real-SDK test join that allowlist. `tests/server-tracing-import-policy.test.ts` pins both, red first.
- **Tests.**
  - `sentry-config.test.ts` asserts each runtime's `init` options, including the settings and both scrubbers, equal to the module's exports.
  - `lib/sentry-data-collection.test.ts` asserts each category and the URL redaction.
  - `lib/sentry-data-collection-sdk.test.ts` replays BUG-318's scenario through the real SDK, as measured above.
- **Compile-time guard.** A check in the module fails typecheck if Sentry adds a top-level category, or a key inside `genAI`, `graphQL` or `httpHeaders`, that the constant does not set. Only the two stack-frame settings stay at Sentry's defaults.
- **Evidence.** Every case was red first, and these targeted mutations each fail a check:
  - dropping either runtime's wiring, or either scrubber's;
  - turning cookies or bodies on;
  - dropping the `__clerk`, `x-clerk`, `referer` or `prerender` term;
  - making either scrubber a no-op;
  - omitting a top-level or nested category, which fails typecheck.
- **An independent adversarial review**, against the installed 10.75.1 and 11.0.0 source, found the live exposure and the URL paths. It also found the stale overrides, the licence change, the shallow type check and several overstatements in this record as first filed. All are addressed here.
- **After release.** Confirm in Sentry that the 5% server traces still arrive under span streaming.

## Verification

Criteria to meet before closing.

- [x] Every `Sentry.init` receives the shared settings and both scrubbers, and a test fails if any runtime omits one or widens a category. The type-level guard covers new categories, nested ones included.
- [x] The real SDK sends none of the credential-bearing values in BUG-318's scenario, and its body capture is off.
- [ ] `@sentry/nextjs` is on v11 on `main`, and the full gate passes.
- [ ] Server traces still arrive in Sentry after the release.
- [ ] #1369 is closed as superseded.

## Related

- [BUG-318](../bugs/bug-318-sentry-sends-credentials-on-server-error-events.md): the live exposure this change fixes.
- Dependabot #1369, with its "do not merge" comment and the correction of 2026-10-05.
- BUG-307 (archived): session tokens in CI logs.
- `app/(marketing)/privacy/privacy-content.ts`: the Sentry row.
