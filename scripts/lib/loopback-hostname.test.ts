import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isLoopbackHostname } from './loopback-hostname';

describe('loopback hostname classification', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])(
    'recognizes %s without authorizing any database operation',
    (host) => {
      expect(isLoopbackHostname(host)).toBe(true);
    },
  );
  it.each([
    '127.0.0.2',
    'localhost.example.com',
    '10.0.0.1',
    '[::2]',
    'example.com',
    '',
  ])('does not broaden the test-lane allowlist to %s', (host) => {
    expect(isLoopbackHostname(host)).toBe(false);
  });
  it.each([
    'tests/shared/integration-database-host.ts',
    'tests/integration/helpers.ts',
    'tests/integration/actions.stripe.integration.test.ts',
    'tests/integration/tag-taxonomy-census.integration.test.ts',
    'tests/integration/db.integration.test.ts',
    'scripts/test-lanes/e2e-local-orchestrator.ts',
    'scripts/database/database-target.ts',
    'tests/shared/resolve-integration-database-url.ts',
  ])('uses the shared classification at %s', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toMatch(
      /import \{ isLoopbackHostname \} from ['"][^'"]*loopback-hostname['"]/,
    );
    expect(source).toMatch(
      /isLoopbackHostname\((?:url|parsed)\.hostname\)|isLoopbackHostname\(host(?:name)?\)/,
    );
  });
});
