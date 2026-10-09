import { describe, expect, it } from 'vitest';
import { runClerkTestingSetup } from './clerk-testing-setup';

// BUG-330 review: @clerk/backend gives its request no time limit, so a Clerk
// API that never answers would hold Playwright's global setup for minutes,
// ahead of preflight's own deadline.
describe('runClerkTestingSetup', () => {
  it("fails with Clerk's name once its deadline passes", async () => {
    await expect(
      runClerkTestingSetup(() => new Promise<void>(() => {}), 50),
    ).rejects.toThrow(
      "Clerk's testing token was not fetched within 50 ms; check Clerk's Backend API status and CLERK_SECRET_KEY",
    );
  });

  it('runs the setup once and resolves when it does', async () => {
    let runs = 0;

    await runClerkTestingSetup(async () => {
      runs += 1;
    }, 1_000);

    expect(runs).toBe(1);
  });
});
