# DEBT-129: NEXT_PUBLIC_SKIP_CLERK Has No Production Safety Guard

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-07

---

## Description

The Clerk middleware bypass (`NEXT_PUBLIC_SKIP_CLERK=true`) completely disables authentication when set. There is no guard preventing this from being set in production. If someone accidentally adds this variable to Vercel production environment settings, the entire app becomes publicly accessible without authentication — full paywall bypass.

## Impact

- **P0 if triggered:** All protected routes become public
- **Current risk:** Low — variable is not set in any committed `.env` files
- **Latent risk:** A developer debugging locally might accidentally deploy with this variable

## Affected File

`proxy.ts:50-52`

```typescript
if (process.env.NEXT_PUBLIC_SKIP_CLERK === 'true') {
  return NextResponse.next();  // ← Bypasses ALL authentication
}
```

## Resolution

Added production safety guard in `proxy.ts`:

```typescript
let hasLoggedSkipClerkProductionWarning = false;

function shouldBypassClerkAuth(): boolean {
  if (process.env.NEXT_PUBLIC_SKIP_CLERK !== 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    if (!hasLoggedSkipClerkProductionWarning) {
      hasLoggedSkipClerkProductionWarning = true;
      console.error(
        'CRITICAL: NEXT_PUBLIC_SKIP_CLERK=true in production; ignoring and enforcing Clerk auth.',
      );
    }
    return false;
  }
  return true;
}
```

The one-time guard flag (`hasLoggedSkipClerkProductionWarning`) ensures the CRITICAL log fires only once, not on every request.

## Verification

- [x] `NEXT_PUBLIC_SKIP_CLERK=true` is ignored in production NODE_ENV
- [x] Still works in development
- [x] Critical log emitted in production misconfiguration scenario

## Related

- `proxy.ts` — Clerk middleware
- `lib/env.ts` — Environment validation
