# DEBT-036: Specs Register and Ports Docs Drift (Status + Interface Mismatch)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Description

The specs system drifted in two ways:

1. `docs/specs/index.md` reported many specs as **Implemented** even though the
   corresponding spec documents still showed `**Status:** Ready` and/or the
   referenced files did not exist yet (especially feature-slice controller specs).
2. Some foundational spec documents (especially ports + repository specs) no longer
   matched the current implementation and SSOT (`docs/specs/master_spec.md`), e.g.:
   - `StripeEventRepository` interface described `ensure/isProcessed`, but the SSOT
     idempotency flow requires `claim/lock` semantics.
   - `WebhookEventResult.subscriptionUpdate` was missing required fields used by
     controllers (e.g., `stripeCustomerId`).

This created documentation-based “false confidence” and made it harder to audit
Clean Architecture compliance from first principles.

## Impact

- **SSOT ambiguity:** contributors cannot trust spec status or port definitions.
- **Review friction:** PR reviews spend time reconciling docs vs code.
- **Architecture drift risk:** wrong port contracts encourage wrong implementations.

## Resolution

Aligned specs documentation with the current code and the master spec:

- Updated foundational specs to reflect the implemented port interfaces (e.g.
  Stripe webhook idempotency via `claim/lock`).
- Corrected spec status reporting in `docs/specs/index.md` to avoid marking
  incomplete slices as “Implemented”.

## Acceptance Criteria

- [x] Spec index no longer mislabels incomplete slices as “Implemented”
- [x] Port specs match current `src/application/ports/**` definitions
- [x] Repository spec idempotency description matches `docs/specs/master_spec.md`

## Related

- `docs/specs/master_spec.md` (Stripe webhook idempotency)
- ADR-001 (Clean Architecture Layers)
- ADR-012 (Directory Structure)
