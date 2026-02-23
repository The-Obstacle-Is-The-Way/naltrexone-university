# DEBT-243: E2E Credential Drift Causes Confusing Test Failures

**Status:** Open
**Priority:** P2
**Date:** 2026-02-23

---

## Description

When the Clerk E2E test user's password drifts from the value stored in `.env.local` (or GitHub Actions secrets), authenticated Playwright tests fail with a generic error from the `@clerk/testing/playwright` SDK:

```
Error: Clerk: Failed to sign in: Password is incorrect. Try again, or use another method.
```

This error is thrown inside `signInWithClerkPassword()` and propagated as a raw test failure. There is **no pre-flight credential validation** — the system only discovers the password is wrong when the first authenticated test attempts to sign in. Each of the 15+ authenticated E2E tests then fails independently with the same error, producing a wall of identical failures that obscures the root cause.

### Root Cause

The `hasClerkCredentials` guard in `tests/e2e/helpers/clerk-auth.ts` only checks for the **presence** of env vars, not their **correctness**:

```typescript
export const hasClerkCredentials = Boolean(clerkUsername && clerkPassword);
```

This means:
- **Missing credentials** → `hasClerkCredentials = false` → tests skip gracefully with a clear message
- **Incorrect credentials** → `hasClerkCredentials = true` → tests attempt auth → fail with a confusing SDK error

### How Credential Drift Happens

1. The test user `e2e-test@addictionboards.com` is created **manually** in the Clerk dashboard
2. The password is stored **independently** in three places:
   - Clerk's backend (bcrypt hash — cannot be read, only verified or reset)
   - `.env.local` (plaintext, gitignored)
   - GitHub Actions secrets (encrypted)
3. Any of these can be changed independently, causing drift
4. Clerk passwords can expire or be reset via dashboard, email, or API — none of which notify `.env.local` or CI

### Impact on This Session

During the BUG-151 affordance audit (2026-02-23), both Playwright E2E tests and the `agent-browser` tool hit "Password is incorrect" for all authenticated pages. The root cause took significant investigation to isolate because:

1. The error looked like it could be a dotenv parsing issue (the password contains `!`, which is a bash history expansion character)
2. It could have been a `@clerk/testing/playwright` SDK issue
3. It could have been a Clerk configuration change (2FA enabled, password strategy disabled, etc.)
4. The actual cause — password drift in Clerk's backend — required a Clerk Backend API call to `verify_password` to confirm

## Impact

- **Developer time waste:** Every session that attempts authenticated E2E tests will hit a wall of confusing failures until someone manually diagnoses the password mismatch
- **False confidence:** If developers don't run E2E tests locally (relying on CI), credential drift can go undetected for days or weeks
- **CI fragility:** If the GitHub Actions secret drifts from Clerk, the entire authenticated E2E suite silently fails (tests skip if creds are missing, but fail noisily if creds are present but wrong)
- **Audit blocking:** Source-level verification can substitute for some browser testing, but focus-ring visibility, hover visual changes, and keyboard navigation can only be validated with a live browser session

## Resolution

### Option A: Pre-Flight Credential Verification (Recommended)

Add a setup step in `tests/e2e/global.setup.ts` that verifies the E2E password against the Clerk Backend API **before** any tests run. If verification fails, skip all authenticated tests with a clear, actionable error message.

```typescript
// In global.setup.ts, after clerkSetup():
setup('verify E2E credentials', async () => {
  if (!process.env.E2E_CLERK_USER_USERNAME || !process.env.E2E_CLERK_USER_PASSWORD) {
    setup.skip();
    return;
  }

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new Error('CLERK_SECRET_KEY required for E2E credential verification');
  }

  // 1. Resolve user ID
  const email = process.env.E2E_CLERK_USER_USERNAME;
  const usersRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
    { headers: { Authorization: `Bearer ${clerkSecretKey}` } },
  );
  const users = await usersRes.json();
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error(
      `E2E CREDENTIAL ERROR: No Clerk user found for ${email}. ` +
      `Create the user in the Clerk dashboard or update E2E_CLERK_USER_USERNAME.`
    );
  }

  // 2. Verify password
  const userId = users[0].id;
  const verifyRes = await fetch(
    `https://api.clerk.com/v1/users/${userId}/verify_password`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
      body: new URLSearchParams({ password: process.env.E2E_CLERK_USER_PASSWORD }),
    },
  );
  const result = await verifyRes.json();

  if (!result.verified) {
    throw new Error(
      `E2E CREDENTIAL ERROR: Password in E2E_CLERK_USER_PASSWORD does not match ` +
      `Clerk's stored password for ${email} (${userId}). ` +
      `Reset the password in the Clerk dashboard to match .env.local, ` +
      `or update .env.local to match Clerk. ` +
      `CLI fix: curl -X PATCH https://api.clerk.com/v1/users/${userId} ` +
      `-H "Authorization: Bearer $CLERK_SECRET_KEY" ` +
      `-d "password=<new-password>"`
    );
  }
});
```

This turns a wall of 15+ confusing test failures into a single, actionable setup error.

### Option B: Wrap signInWithClerkPassword Error

Minimum viable fix — catch the SDK error and re-throw with context:

```typescript
export async function signInWithClerkPassword(page: Page): Promise<void> {
  if (!clerkUsername || !clerkPassword) {
    throw new Error('Missing Clerk E2E credentials');
  }

  try {
    await page.goto('/sign-in');
    await clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: clerkUsername,
        password: clerkPassword,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('incorrect') || message.includes('Password')) {
      throw new Error(
        `E2E CREDENTIAL DRIFT: Clerk rejected the password for ${clerkUsername}. ` +
        `The password in E2E_CLERK_USER_PASSWORD does not match Clerk's stored value. ` +
        `Reset it in the Clerk dashboard or via API. Original: ${message}`
      );
    }
    throw error;
  }
}
```

### Recommendation

**Implement Option A.** It catches the problem once at setup, prevents 15+ redundant failures, and provides a copy-pasteable CLI fix in the error message. Option B can be added as defense-in-depth but doesn't prevent the wall of failures.

## Verification

1. Set `E2E_CLERK_USER_PASSWORD` to a known-incorrect value
2. Run `pnpm test:e2e`
3. Verify a single, clear error appears in setup (not 15+ test failures)
4. Error message includes the user ID, email, and actionable fix instructions
5. Reset password to correct value and verify tests pass

## Related

- [DEBT-104](../_archive/debt/debt-104-missing-e2e-test-credentials.md) — Original "missing credentials" debt (addressed presence, not correctness)
- [DEBT-239](../_archive/debt/debt-239-env-local-stripe-account-mismatch.md) — Recent env credential gaps audit
- [DEBT-205](../_archive/debt/debt-205-e2e-selector-drift-from-ui-refactors.md) — Similar drift problem with E2E selectors
- `tests/e2e/helpers/clerk-auth.ts` — Current `hasClerkCredentials` implementation
- `tests/e2e/global.setup.ts` — Where pre-flight verification should be added
