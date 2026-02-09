# DEBT-193: Backend Production Files Exceed 300-Line Guideline

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08

---

## Description

Five production files exceed the 300-line guideline — four backend and one frontend. While test files are exempt from the cap, these are implementation files that could benefit from decomposition.

## Affected Files

| File | Lines | Notes |
|------|-------|-------|
| `src/adapters/repositories/drizzle-practice-session-repository.ts` | 246 | DB operations only; params codec and CAS update loop extracted |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | 298 | DB operations only; row mappers extracted |
| `src/adapters/controllers/practice-controller.ts` | 248 | Action wiring only; Zod schemas extracted |
| `src/adapters/jobs/reconcile-stripe-subscriptions.ts` | 268 | Orchestration only; types extracted |
| `components/marketing/marketing-home.tsx` | 279 | Reduced under cap as part of marketing layout + design system adoption |

Note: `checkout-success-sync.tsx` (437 lines) is already tracked as FE-035.

## Impact

- Harder to navigate and reason about individual modules
- Increased merge conflict surface area
- Higher cognitive load for new contributors

## Resolution

- **drizzle-practice-session-repository.ts:** Extracted params parsing/normalization/serialization to `src/adapters/repositories/practice-session-params.ts` and extracted the CAS update loop to `src/adapters/repositories/practice-session-question-state-updater.ts`.
- **drizzle-attempt-repository.ts:** Extracted row mappers to `src/adapters/repositories/attempt-row-mappers.ts`.
- **practice-controller.ts:** Extracted Zod schemas to `src/adapters/controllers/practice-schemas.ts`.
- **reconcile-stripe-subscriptions.ts:** Extracted types to `src/adapters/jobs/reconcile-stripe-subscriptions-types.ts`.
- **marketing-home.tsx:** Reduced under cap as part of FE work; no additional decomposition required.

## Verification

- Each file under 300 lines post-split
- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build`

## Related

- FE-035 (checkout-success-sync.tsx — tracked separately)
- DEBT-142 (resolved — SPEC-020 practice page line cap)
