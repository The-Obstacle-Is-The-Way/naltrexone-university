import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RECONCILE_RUN_MAX_DURATION_SECONDS } from '@/src/adapters/jobs/stripe-reconcile-watch';

// DEBT-501 item 9: the watch treats a reconcile run older than the route's
// maxDuration as finished or killed. Next.js reads maxDuration as a literal,
// so the route cannot import the constant; this pins the two together.
describe('RECONCILE_RUN_MAX_DURATION_SECONDS', () => {
  it("is the reconcile route's maxDuration", () => {
    const route = readFileSync(
      'app/api/cron/reconcile-stripe-subscriptions/route.ts',
      'utf8',
    );

    expect(route).toContain(
      `export const maxDuration = ${RECONCILE_RUN_MAX_DURATION_SECONDS};`,
    );
  });
});
