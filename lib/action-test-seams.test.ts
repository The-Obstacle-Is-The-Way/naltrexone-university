import { afterEach, describe, expect, it, vi } from 'vitest';
import { testSeam } from './action-test-seams';

// A client can call a server action with any arguments it likes. The optional
// dependencies some actions take exist for tests, so a production build drops
// them.
describe('testSeam', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes a test seam through outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const deps = { value: 'injected' };

    expect(testSeam(deps)).toBe(deps);
  });

  it('drops it in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(testSeam({ value: 'from a client' })).toBeUndefined();
  });
});
