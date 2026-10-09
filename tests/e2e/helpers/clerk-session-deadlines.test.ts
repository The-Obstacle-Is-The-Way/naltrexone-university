import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CLERK_SESSION_DEADLINES,
  reserveSessionBudget,
} from './clerk-session-deadlines';

// BUG-328: preparation has no fixed length (preflight, the Stripe sweep, the
// seed and the reset), so the session work's deadlines are reserved once it
// ends.
describe('reserveSessionBudget', () => {
  it('extends the setup timeout past both deadlines from now', () => {
    const testInfo = { setTimeout: vi.fn() };

    reserveSessionBudget(testInfo, 1_000, 41_000);

    expect(testInfo.setTimeout).toHaveBeenCalledWith(
      40_000 +
        CLERK_SESSION_DEADLINES.signInMs +
        CLERK_SESSION_DEADLINES.signOutMs +
        5_000,
    );
  });

  it('is reserved by global setup before it signs in', () => {
    const source = readFileSync('tests/e2e/global.setup.ts', 'utf8');
    const prepared = source.indexOf('await runE2EUserStateReset()');
    const reserved = source.indexOf('reserveSessionBudget(testInfo');
    const signedIn = source.indexOf('createClerkE2EAuthState(page)');

    expect(prepared).toBeGreaterThan(-1);
    expect(reserved).toBeGreaterThan(prepared);
    expect(reserved).toBeLessThan(signedIn);
  });
});
