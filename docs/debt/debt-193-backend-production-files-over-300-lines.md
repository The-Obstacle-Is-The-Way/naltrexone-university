# DEBT-193: Backend Production Files Exceed 300-Line Guideline

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

---

## Description

Four backend production files exceed the 300-line guideline. While test files are exempt from the cap, these are implementation files that could benefit from decomposition.

## Affected Files

| File | Lines | Notes |
|------|-------|-------|
| `src/adapters/repositories/drizzle-practice-session-repository.ts` | 446 | Complex JSON params parsing, CAS retry, question state serialization |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | 353 | Multiple query methods, row-to-domain mapping |
| `src/adapters/controllers/practice-controller.ts` | 331 | 8 server actions, Zod validation per action |
| `src/adapters/jobs/reconcile-stripe-subscriptions.ts` | 302 | Barely over; reconciliation + normalization logic |
| `components/marketing/marketing-home.tsx` | 357 | Marketing landing page with stats, features, pricing, footer |

Note: `checkout-success-sync.tsx` (437 lines) is already tracked as FE-035.

## Impact

- Harder to navigate and reason about individual modules
- Increased merge conflict surface area
- Higher cognitive load for new contributors

## Resolution

- **drizzle-practice-session-repository.ts:** Extract `PracticeSessionParamsCodec` (schema + parse + normalize + serialize) into a separate `practice-session-params.ts` module
- **drizzle-attempt-repository.ts:** Extract shared row-to-domain mapper if pattern repeats
- **practice-controller.ts:** Extract Zod schemas to `practice-schemas.ts` if they can be shared
- **marketing-home.tsx:** Extract section components (HeroSection, StatsSection, FeaturesSection, PricingSection, FooterSection)
- **reconcile-stripe-subscriptions.ts:** Barely over cap; leave as-is unless a natural seam appears

## Verification

- Each file under 300 lines post-split
- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build`

## Related

- FE-035 (checkout-success-sync.tsx — tracked separately)
- DEBT-142 (resolved — SPEC-020 practice page line cap)
