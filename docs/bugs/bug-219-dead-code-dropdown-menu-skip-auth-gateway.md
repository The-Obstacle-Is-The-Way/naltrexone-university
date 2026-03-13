# BUG-219: Unused `SkipAuthGateway` Dead Code; `DropdownMenu` Is Spec-Mandated

**Status:** Open
**Priority:** P4 (narrowed after verification)
**Date:** 2026-03-13

## Summary

The original report was half false positive. `components/ui/dropdown-menu.tsx` has zero current production consumers, but the repo’s frontend standards and master spec explicitly say to keep it. The remaining real issue is narrower: `SkipAuthGateway` is unused dead code that is re-exported from the gateways barrel even though the real `NEXT_PUBLIC_SKIP_CLERK=true` path uses a different mechanism. The original doc was also factually wrong about its behavior: it does not return a hardcoded user.

## Impact

- `DropdownMenu` is not a bug; removing it would violate the repo’s documented UI SSOT.
- `SkipAuthGateway` adds cognitive overhead and suggests an alternate auth-bypass path that does not actually exist.
- This is maintenance dead code, not a runtime auth flaw.

## Verification Notes

1. **`SkipAuthGateway` is real and currently unused.** `src/adapters/gateways/skip-auth-gateway.ts:1-12` defines the class, and `src/adapters/gateways/index.ts:1-3` re-exports it. A repo-wide search for `SkipAuthGateway` only finds that file, the barrel export, and the bug docs; there is no production consumer.
2. **The original behavior claim was wrong.** `src/adapters/gateways/skip-auth-gateway.ts:5-12` returns `null` from `getCurrentUser()` and throws `UNAUTHENTICATED` from `requireUser()`. It does not return a hardcoded user and it does not implement a local-dev auth bypass.
3. **The real skip-Clerk composition path uses a different mechanism.** `lib/container.ts:59-63` handles `NEXT_PUBLIC_SKIP_CLERK === 'true'` by making `getClerkUser()` return `null`, then `lib/container.ts:74-83` still builds the normal gateway factory set. No branch instantiates `SkipAuthGateway`.
4. **Existing tests already guard the actual skip-Clerk behavior.** `lib/container.skip-clerk.test.ts:34-75` verifies that skip-Clerk mode does not import Clerk server modules and that the normal auth/billing deps resolve through the null-`getClerkUser()` path.
5. **`DropdownMenu` is intentionally kept despite zero consumers.** `docs/specs/master_spec.md:2191` requires generating `DropdownMenu` in the base component set, and `docs/frontend/standards.md:144-148` plus `docs/frontend/standards.md:769-774` explicitly mark `components/ui/dropdown-menu.tsx` as “0 consumers — KEEP (spec-mandated).”

## Precise TDD Fix

1. Do not delete `components/ui/dropdown-menu.tsx`; it is intentionally retained by the repo’s documented frontend SSOT.
2. Rely on the existing skip-Clerk container coverage in `lib/container.skip-clerk.test.ts:34-75` as the behavioral guard for the real auth-bypass mechanism.
3. Delete `src/adapters/gateways/skip-auth-gateway.ts` and remove its re-export from `src/adapters/gateways/index.ts` unless a concrete composition-root use case for that class is introduced.
