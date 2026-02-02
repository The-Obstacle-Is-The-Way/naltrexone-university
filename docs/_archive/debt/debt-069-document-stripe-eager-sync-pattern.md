# DEBT-069: Document Stripe Eager Sync Pattern

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The codebase implements an “eager sync” pattern on the checkout success page to mitigate webhook timing races, and this decision needed to be documented to prevent accidental removal.

## Resolution

- Added `docs/adr/adr-014-stripe-eager-sync.md` documenting the pattern and tradeoffs.
- Added inline documentation to `syncCheckoutSuccess()` explaining why it exists alongside webhooks.

## Verification

- [x] ADR exists and is linked from `docs/adr/index.md`.
- [x] Checkout success eager sync code includes a high-level explanation.

## Related

- `docs/adr/adr-014-stripe-eager-sync.md`
- `app/(marketing)/checkout/success/page.tsx`
