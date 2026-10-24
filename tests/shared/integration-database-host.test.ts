import { describe, expect, it } from 'vitest';
import { integrationDatabaseHostProblem } from './integration-database-host';

describe('integration database host check', () => {
  it.each(['127.0.0.1', 'localhost'])(
    'accepts the loopback host %s',
    (host) => {
      expect(integrationDatabaseHostProblem(host, false)).toBeUndefined();
    },
  );

  it('refuses a remote host without the override', () => {
    expect(integrationDatabaseHostProblem('db.example.com', false)).toMatch(
      /non-local DATABASE_URL host "db\.example\.com"/,
    );
  });

  it('allows a remote host with the explicit override', () => {
    expect(
      integrationDatabaseHostProblem('db.example.com', true),
    ).toBeUndefined();
  });

  it.each([false, true])(
    'refuses IPv6 loopback for the driver limit, not as non-local (override %s)',
    (allowNonLocal) => {
      const problem = integrationDatabaseHostProblem('[::1]', allowNonLocal);
      expect(problem).toMatch(/127\.0\.0\.1/);
      expect(problem).not.toMatch(/non-local/);
    },
  );
});
