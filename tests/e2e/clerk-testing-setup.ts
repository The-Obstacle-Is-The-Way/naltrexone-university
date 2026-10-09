import { clerkSetup } from '@clerk/testing/playwright';

// BUG-330: Clerk's testing token is fetched once, in Playwright's main
// process, so every worker inherits CLERK_FAPI and CLERK_TESTING_TOKEN and
// each signed-in test sends the token with its Frontend API requests. Run
// inside the setup project, it reached only that project's worker.
export default async function clerkTestingSetup(): Promise<void> {
  await clerkSetup();
}
