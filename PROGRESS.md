# Naltrexone University - Progress Tracker

**Last Updated:** 2026-01-31
**Current Slice:** SLICE-1 (Paywall)
**Purpose:** State file for Ralph Wiggum loop (see `docs/_ralphwiggum/protocol.md`)

---

## Completed Phases

### Phase 0: SLICE-0 Foundation Setup (COMPLETE)

- [x] **SLICE-0-01**: Initialize Next.js 16+ with TypeScript strict mode
- [x] **SLICE-0-02**: Configure pnpm as package manager (removed package-lock.json)
- [x] **SLICE-0-03**: Install and configure Biome for linting/formatting
- [x] **SLICE-0-04**: Install Tailwind CSS v4 with PostCSS (already configured)
- [x] **SLICE-0-05**: Install shadcn/ui base components (already configured)
- [x] **SLICE-0-06**: Configure Clerk authentication (proxy.ts + ClerkProvider)
- [x] **SLICE-0-07**: Set up Drizzle ORM with spec schema (db/schema.ts)
- [x] **SLICE-0-08**: Create landing page with auth buttons (app/page.tsx)
- [x] **SLICE-0-09**: Add /api/health endpoint
- [x] **SLICE-0-10**: Configure Vitest and Playwright
- [x] **SLICE-0-11**: Set up CI pipeline (GitHub Actions)

**Completion:** Manual baseline refactor completed 2026-01-31. All quality gates pass.

---

## Active Queue

### Phase 1: SLICE-1 Paywall

- [ ] **SLICE-1-01**: Create Stripe products/prices in test mode → `master_spec.md` Section 11
- [ ] **SLICE-1-02**: Implement `lib/stripe.ts` SDK initialization → `master_spec.md` Section 4.5.1
- [ ] **SLICE-1-03**: Implement `createCheckoutSession` server action → `master_spec.md` Section 4.5.1
- [ ] **SLICE-1-04**: Implement `createPortalSession` server action → `master_spec.md` Section 4.5.2
- [ ] **SLICE-1-05**: Implement `/api/stripe/webhook` with signature verification → `master_spec.md` Section 4.4.2
- [ ] **SLICE-1-06**: Implement `/checkout/success` page with Stripe sync → `master_spec.md` Section 6
- [ ] **SLICE-1-07**: Implement subscription gate in app layout → `master_spec.md` Section 4.2
- [ ] **SLICE-1-08**: Build `/app/billing` page with portal link → `master_spec.md` Section 6
- [ ] **SLICE-1-09**: Add integration tests for Stripe actions → `master_spec.md` Section 8.2
- [ ] **SLICE-1-10**: Add E2E test for subscribe flow → `master_spec.md` Section 8.3

### Phase 2: SLICE-2 Core Question Loop (Future)

_Tasks will be added when SLICE-1 is complete_

---

## Work Log

- 2026-01-31: **[SLICE-0 COMPLETE]** Manual baseline refactor via interactive Claude session. 16 atomic commits. Next.js 16.1.6, Clerk auth, Drizzle schema per spec, Biome linting, Vitest/Playwright configs, GitHub Actions CI.
- 2026-01-31: **[START]** Initialized PROGRESS.md for Ralph Wiggum loop.

---

## Completion Criteria

**SLICE-1 is complete when:**
- All Phase 1 items are `[x]`
- Quality gates pass: `pnpm biome check .`, `pnpm tsc --noEmit`, `pnpm test`
- Webhook events update `stripe_customers` + `stripe_subscriptions`
- Unsubscribed users cannot access `/app/*`
- Subscribed users can access `/app/*`
- Customer Portal opens and returns to `/app/billing`
