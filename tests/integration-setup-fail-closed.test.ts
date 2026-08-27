import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('integration setup database prerequisite', () => {
  it('fails a supported direct Vitest run when DATABASE_URL is empty', () => {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.integration.config.mts',
        'tests/integration/stripe-checkout-client-contract.integration.test.ts',
        '--reporter=dot',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: '1',
          DATABASE_URL: '',
          NO_COLOR: '1',
          RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT: 'false',
          RUN_STRIPE_TRIAL_CLOCK_SMOKE: 'false',
        },
        timeout: 8_000,
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain(
      'DATABASE_URL is required to run integration tests',
    );
  });

  it('does not give direct Vitest an implicit fixed-port database fallback', () => {
    expect(readFileSync('.env.test', 'utf8')).not.toMatch(/^DATABASE_URL=/m);
  });
});
