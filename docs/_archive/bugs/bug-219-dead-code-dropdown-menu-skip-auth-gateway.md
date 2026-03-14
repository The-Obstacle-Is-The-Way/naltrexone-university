# BUG-219: Unused `SkipAuthGateway` Dead Code; `DropdownMenu` Is Spec-Mandated

**Status:** Resolved
**Priority:** P4 (narrowed after verification)
**Date:** 2026-03-13
**Resolved:** 2026-03-14 (PR #215)

## Summary

`SkipAuthGateway` is unused dead code re-exported from the gateways barrel. No composition root instantiates it — the real skip-Clerk path uses a null-`getClerkUser()` mechanism in `lib/container.ts`. `DropdownMenu` is intentionally retained per master spec and frontend standards.

## Resolution

Deleted `src/adapters/gateways/skip-auth-gateway.ts` and removed its re-export from `src/adapters/gateways/index.ts`. `DropdownMenu` left intact per documented SSOT.
