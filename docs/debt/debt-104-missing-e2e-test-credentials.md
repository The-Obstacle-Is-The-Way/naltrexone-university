# DEBT-104: Missing E2E Test Credentials for Authenticated Flows

**Status:** Open
**Priority:** P1
**Date:** 2026-02-05

---

## Description

E2E tests for authenticated flows (practice, dashboard, billing, etc.) are skipped because the required environment variables are not configured:

- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`

This means critical user flows cannot be automatically tested:
- Practice question answering
- Session creation (BUG-062)
- Dashboard stats display
- Billing management
- Bookmark/review functionality

---

## Impact

- **Critical**: Cannot verify the most important user flows automatically
- BUG-062 (practice sessions not working) cannot be verified via E2E tests
- Manual testing required for all authenticated features
- Regression risk is high for subscription-gated features

---

## Resolution

1. Create a dedicated test user in Clerk:
   - Email: `e2e-test@naltrexone-university.com` (or similar)
   - Password: Strong, randomly generated
   - Note: This user should have an active subscription for full testing

2. Add credentials to `.env.local`:
   ```
   E2E_CLERK_USER_USERNAME=e2e-test@naltrexone-university.com
   E2E_CLERK_USER_PASSWORD=<secure-password>
   ```

3. For CI/CD, add these as GitHub secrets:
   - `E2E_CLERK_USER_USERNAME`
   - `E2E_CLERK_USER_PASSWORD`

4. Ensure test user has an active Stripe subscription for full test coverage

---

## Verification

- [ ] Test user created in Clerk dashboard
- [ ] Test user has active subscription
- [ ] Credentials added to `.env.local`
- [ ] `pnpm test:e2e` runs all tests (none skipped due to missing credentials)
- [ ] CI/CD secrets configured

---

## Related

- `tests/e2e/practice.spec.ts` - practice E2E test (currently skipped)
- `tests/e2e/subscribe-and-practice.spec.ts` - subscription flow test
- BUG-062: Practice Session Modes Not Working
