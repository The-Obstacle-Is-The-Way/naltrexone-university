# DEBT-340: Clerk v7 (Core 3) + Next.js 16.2 Upgrade

**Priority:** P2
**Created:** 2026-03-28
**Status:** Implemented — Clerk v7 upgrade + Next.js 16.2.1 bump complete

---

## Problem

This branch completes two dependency upgrades that were pending:

1. **`@clerk/nextjs` v6 → v7 (Core 3)** — Clerk's dashboard shows a "Client Trust Status" update requiring Core 3. The v6 package is one major version behind; staying on v6 blocks Clerk security features (Client Trust) and will accumulate drift over time.
2. **`next` 16.1.6 → 16.2.1** — Minor version bump with no breaking changes; brings ~87% faster dev startup and ~25-60% faster SSR rendering.

## Investigation Summary

### What the `@clerk/upgrade` CLI found

The CLI was run on branch `debt-340-clerk-v7-nextjs-upgrade` and performed:

**Automated changes (already applied on this branch):**

| Change | File | Detail |
|--------|------|--------|
| Package bump | `package.json` | `@clerk/nextjs` `^6.38.1` → `^7.0.7` |
| Package swap | `package.json` | `@clerk/themes` removed, `@clerk/ui` `^1.2.4` added (larger transitive dep surface than `@clerk/themes` — lockfile churn reflects this) |
| Theme import | `components/providers.tsx` | `from '@clerk/themes'` → `from '@clerk/ui/themes'` |
| Dead code removal | `lib/auth.ts` | Removed unused `getAuth()` export and dead `auth` import |
| Vendor docs | `docs/vendor-docs/clerk.md`, `index.md` | Version updated to ^7.0.7, reconciliation date to 2026-03-28 |
| Lockfile | `pnpm-lock.yaml` | Regenerated (~3100 lines changed, partly due to `@clerk/ui` transitive deps) |

**13 codemods ran — only 1 modified a file** (`transform-themes-to-ui-themes`). The other 12 found zero applicable code, confirming the codebase was already v7-pattern-compliant:

- `auth()` already called with `await` everywhere
- `currentUser()` already called with `await` everywhere
- No `clerkClient()` usage
- No `<SignedIn>`, `<SignedOut>`, `<Protect>` components to migrate to `<Show>`
- No deprecated `appearance.layout` usage
- No deprecated redirect props on Clerk components
- No deprecated prefixes or satellite config
- `ClerkProvider` already inside `<body>`

### Flagged issues (all false positives or info-only)

**1. "Legacy redirect props removed" — 17 instances (FALSE POSITIVES)**

The scanner regex-matched local variables named `redirectUrl` and query parameters named `redirect_url`. None are Clerk component props:

- `proxy.ts:144-158` — Local `redirectUrl` variable in `logCheckoutSuccessAuthBounce()`. This function parses Clerk's handshake redirect URL to detect auth bounces on `/checkout/success`. The `redirect_url` it reads is a Clerk-internal query parameter, not a Clerk component prop we set.
- `proxy.test.ts:384-444` — Tests for the above function, asserting the `redirect_url` query param.
- `app/pricing/subscribe-actions.test.ts:176-179` — Test variable `redirectUrl` for pricing redirect assertions. Unrelated to Clerk.

**Verdict:** No code changes needed. These are local variables and URL query parameters, not Clerk API surface.

**2. "`auth.protect()` returns 401 instead of 404" — 2 instances (BEHAVIOR NOTE)**

- `proxy.ts:201` — Our middleware calls `await auth.protect()` for non-public routes.
- Core 3 changed: unauthenticated requests to **server actions** now get 401 (was 404). Standard route requests with missing session tokens still get redirected to sign-in as before.

**Verdict:** No code change needed. Our middleware usage is standard. The 401 vs 404 distinction only matters for programmatic callers of server actions, and our server actions already handle auth internally via the container's `AuthGateway`.

**3. "Client Trust status handling" — 0 instances**

Not applicable. We use Clerk's prebuilt `<SignIn />` component, which handles `needs_client_trust` automatically.

### Codebase auth touchpoints (verified v7-compatible)

| File | APIs Used | Status |
|------|-----------|--------|
| `lib/auth.ts` | `currentUser()` with `await` | Already v7 (dead `getAuth` removed) |
| `proxy.ts` | `clerkMiddleware()`, `auth.protect()` async | Already v7 |
| `lib/container.ts` | Dynamic `currentUser` import | Already v7 |
| `components/providers.tsx` | `ClerkProvider`, `@clerk/ui/themes` | Migrated by codemod |
| `app/sign-in/.../sign-in-page-client.tsx` | `<SignIn />` prebuilt component | Already v7 |
| `app/sign-up/.../sign-up-page-client.tsx` | `<SignUp />` prebuilt component | Already v7 |
| `components/auth-nav.tsx` | `<UserButton />` prebuilt component | Already v7 |
| `app/api/webhooks/clerk/route.ts` | `verifyWebhook()` from `@clerk/nextjs/webhooks` | Already v7 |
| `app/(marketing)/checkout/success/checkout-success-deps.ts` | Dynamic `auth` import from `@clerk/nextjs/server` | Already v7 |
| `src/adapters/gateways/clerk-auth-gateway.ts` | Injected `getClerkUser` (wraps `currentUser`) | Already v7 |
| `tests/e2e/global.setup.ts` | `clerkSetup()` from `@clerk/testing/playwright` | Already v7 |
| `tests/e2e/helpers/clerk-auth.ts` | `clerk.signIn()` from `@clerk/testing/playwright` | Already v7 |

### Why the codebase was already v7-ready on v6

- Next.js 15+ made `headers()`, `cookies()`, and `params` async. Clerk v6 adapted by making `auth()` async in its v6.x releases to align with Next.js. Our code already used `await`.
- Next.js 16 renamed `middleware.ts` → `proxy.ts`. We adopted `proxy.ts` early.
- We use Clerk's prebuilt components (`<SignIn />`, `<SignUp />`, `<UserButton />`) exclusively — no custom auth flows that would need `needs_client_trust` handling.
- We don't use `clerkClient()`, `<SignedIn>`, `<SignedOut>`, `<Protect>`, or any of the deprecated APIs.

---

## Implementation Plan

### Phase 1: Clerk v7 (this branch already has the changes)

The `@clerk/upgrade` CLI already applied all changes on branch `debt-340-clerk-v7-nextjs-upgrade`:

1. **Verify the automated changes** — review the diff in `package.json`, `components/providers.tsx`, and `pnpm-lock.yaml`
2. **Run the full pre-PR gate:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
   ```
3. **Local smoke test** — `pnpm dev`, sign in, navigate protected routes, verify Clerk components render correctly
4. **If all green** — commit and open PR

### Phase 2: Post-deploy (Clerk dashboard)

1. **Click "Update"** on the Client Trust Status feature in the Clerk production dashboard
2. This enables automatic credential-stuffing protection for password sign-ins from new devices
3. No code changes needed — prebuilt `<SignIn />` handles `needs_client_trust` automatically

### Rollback plan

If issues arise in production:
- Revert the PR (standard git revert)
- `pnpm install` to restore the old lockfile
- Clerk v6 and v7 use the same Clerk dashboard/backend — no backend migration to undo

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Clerk UI components render differently on v7 | Low | Low | Visual smoke test before merge |
| `auth.protect()` 401 vs 404 behavior change breaks something | Very Low | Low | Our server actions handle auth via `AuthGateway`, not middleware `protect()` |
| `@clerk/testing` incompatibility with v7 | Very Low | Medium | E2E tests in pre-PR gate will catch this |
| Next.js 16.2 regression | Very Low | Low | No breaking changes; pre-PR gate covers it |

**Overall risk: Low.** The codebase was already v7-pattern-compliant. The source-level changes are minimal (one import path, one dead export removal), though the `@clerk/themes` → `@clerk/ui` swap brings a larger transitive dependency surface. All 2232 unit tests + 206 browser tests + production build pass.

---

## References

- [Clerk Core 3 Upgrade Guide](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3)
- [Client Trust Documentation](https://clerk.com/docs/guides/secure/client-trust)
- [Client Trust Announcement](https://clerk.com/changelog/2025-11-14-client-trust-credential-stuffing-killer)
- [@clerk/upgrade CLI](https://www.npmjs.com/package/@clerk/upgrade)
- [Next.js 16.2 Blog Post](https://nextjs.org/blog/next-16-2)
