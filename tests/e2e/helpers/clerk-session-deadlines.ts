// BUG-328: deadlines for global setup's Clerk session work. Clerk's sign-in
// and sign-out run page.evaluate, which Playwright never times out, and its
// testing-token route handler retries each Clerk request for up to about a
// minute. The setup project's timeout covers the preparation and both
// deadlines, so a failed attempt always has time to sign out its session.
export const CLERK_SESSION_DEADLINES = {
  signInMs: 30_000,
  signOutMs: 20_000,
} as const;

// The credential health check, seed, reset and clerkSetup that run before
// sign-in; together about 3 seconds in CI.
export const SETUP_PREPARATION_BUDGET_MS = 30_000;

export const SETUP_TIMEOUT_MS =
  SETUP_PREPARATION_BUDGET_MS +
  CLERK_SESSION_DEADLINES.signInMs +
  CLERK_SESSION_DEADLINES.signOutMs;
