import { afterEach, describe, expect, it, vi } from 'vitest';
import { testSeam } from './action-test-seams';

// A client can call a server action with any arguments it likes. The optional
// dependencies some actions take exist for tests, so a production build drops
// them.
describe('testSeam', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['test', 'development'])(
    'passes a test seam through when NODE_ENV is %s',
    (env) => {
      vi.stubEnv('NODE_ENV', env);
      const deps = { value: 'injected' };

      expect(testSeam(deps)).toBe(deps);
    },
  );

  // Fail closed: only a known test or development run keeps the seam.
  it.each([
    ['a production build', 'production'],
    ['an unset NODE_ENV', undefined],
    ['an unrecognized NODE_ENV', 'staging'],
  ])('drops it for %s', (_case, env) => {
    vi.stubEnv('NODE_ENV', env);

    expect(testSeam({ value: 'from a client' })).toBeUndefined();
  });
});
