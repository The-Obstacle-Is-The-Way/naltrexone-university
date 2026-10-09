// BUG-328: deadlines for global setup's Clerk session work. Clerk's sign-in
// and sign-out run page.evaluate, which Playwright never times out, and its
// testing-token route handler retries each Clerk request for up to about a
// minute. Global setup reserves both deadlines once its preparation ends, so
// a failed attempt has the full sign-out deadline however long preparation
// took.
export const CLERK_SESSION_DEADLINES = {
  signInMs: 30_000,
  signOutMs: 20_000,
} as const;

// The setup test's timeout until the session budget is reserved: the
// credential health check, Stripe customer sweep, seed and reset, which take
// about 3 seconds in CI. Preflight's two Clerk calls share one 30-second
// deadline (BUG-330), and the sweep stops at 10 seconds (DEBT-508). Clerk's
// testing token is fetched before any project runs, in Playwright's global
// setup.
export const SETUP_PREPARATION_BUDGET_MS = 60_000;

// Playwright counts the test's fixture setup, which runs before startedAt.
const FIXTURE_MARGIN_MS = 5_000;

export function reserveSessionBudget(
  testInfo: { setTimeout(timeout: number): void },
  startedAt: number,
  now = Date.now(),
): void {
  testInfo.setTimeout(
    now -
      startedAt +
      CLERK_SESSION_DEADLINES.signInMs +
      CLERK_SESSION_DEADLINES.signOutMs +
      FIXTURE_MARGIN_MS,
  );
}
