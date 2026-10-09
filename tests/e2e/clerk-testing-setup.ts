import { clerkSetup } from '@clerk/testing/playwright';
import { withTimeout } from '@/lib/with-timeout';
import { CLERK_TESTING_SETUP_DEADLINE_MS } from './helpers/clerk-session-deadlines';

// BUG-330: Clerk's testing token is fetched once, in Playwright's main
// process, so every worker inherits CLERK_FAPI and CLERK_TESTING_TOKEN and
// each signed-in test sends the token with its Frontend API requests. Run
// inside the setup project, it reached only that project's worker.
export async function runClerkTestingSetup(
  setup: () => Promise<void> = clerkSetup,
  deadlineMs: number = CLERK_TESTING_SETUP_DEADLINE_MS,
): Promise<void> {
  await withTimeout(setup(), deadlineMs).catch((error: unknown) => {
    throw new Error(
      `Clerk's testing token was not fetched within ${deadlineMs} ms; check Clerk's Backend API status and CLERK_SECRET_KEY`,
      { cause: error },
    );
  });
}

export default function clerkTestingSetup(): Promise<void> {
  return runClerkTestingSetup();
}
