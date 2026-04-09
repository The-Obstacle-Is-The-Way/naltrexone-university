# BUG-234: AuthNav Can Render Clerk UserButton Without an Active ClerkProvider

## Status: Resolved (PR #271, merged 2026-04-09)

## Severity: Low

## Summary
Authenticated preview renders of the app shell can throw Clerk's missing-provider error because `AuthNav` imported `UserButton` directly inside a server component while the active `ClerkProvider` was mounted behind a client-only boundary.

The defect is low-severity because it is currently isolated to preview traffic, but it is a real render-path bug rather than benign Sentry noise.

## Evidence
- Sentry issue `ADDICTION-BOARDS-WEB-K` (`7397187291`)
- 2 events, 0 users
- First seen: 2026-04-08 22:14 UTC
- Last seen: 2026-04-08 22:32 UTC
- Environment: `preview`
- Route: `/app/practice/[sessionId]`
- Browser tag: `Chrome 146.0.0`
- Latest event platform: `node`
- Stack includes `Object.throwMissingClerkProviderError`

## Root Cause Analysis
- [`components/providers.tsx`](../../components/providers.tsx) loads `ClerkProvider` through `next/dynamic(..., { ssr: false })`, so the provider does not participate in the server render path.
- [`components/auth-nav.tsx`](../../components/auth-nav.tsx) previously imported `UserButton` directly inside the async server component and rendered it whenever the request was authenticated.
- In preview renders, Next.js evaluated that server path before the client-owned Clerk provider existed, so Clerk threw the runtime invariant that `UserButton` must be rendered within `<ClerkProvider />`.

## User Impact
- No confirmed production-user impact as of 2026-04-09.
- Preview QA on authenticated app routes can hit a server-render failure, which weakens staging confidence and can hide real preview regressions behind auth-shell crashes.

## Recommended Action
- Keep auth-state resolution in the server component.
- Route the actual Clerk `UserButton` through a client wrapper so the server render never evaluates the Clerk surface before the client provider is live.
- Keep regression coverage on both the wrapper and `AuthNav`.
- After deployment, resolve `WEB-K` in Sentry and confirm no new preview events recur.

## References
- [AuthNav](../../components/auth-nav.tsx)
- [AuthUserButton](../../components/auth-user-button.tsx)
- [Providers](../../components/providers.tsx)
- [Clerk CSP Docs](https://clerk.com/docs/security/clerk-csp)
- [Clerk Next.js Authentication Guide](https://clerk.com/blog/nextjs-authentication)
