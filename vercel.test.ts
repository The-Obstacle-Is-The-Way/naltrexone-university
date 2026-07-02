import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vercel cron configuration', () => {
  it('runs checked-in database migrations before building deploys', () => {
    const config = JSON.parse(
      readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
    );

    expect(config.buildCommand).toBe('pnpm db:migrate && pnpm build');
  });

  it('schedules Stripe reconciliation in all-pages live mode', () => {
    const config = JSON.parse(
      readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
    );

    expect(config.crons).toContainEqual({
      path: '/api/cron/reconcile-stripe-subscriptions?dryRun=false&scope=all',
      schedule: '0 8 * * *',
    });
  });
});
