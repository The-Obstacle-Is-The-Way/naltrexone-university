import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDepsResolver } from './controller-helpers';

describe('createDepsResolver', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const resolverWith = (fromContainer: string) =>
    createDepsResolver(
      (container: { value: string }) => container.value,
      async () => ({ value: fromContainer }),
    );

  it('uses dependencies a test injects', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    expect(await resolverWith('container')('injected')).toBe('injected');
  });

  it('uses a container a test supplies', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    expect(
      await resolverWith('container')(undefined, {
        loadContainer: async () => ({ value: 'custom' }),
      }),
    ).toBe('custom');
  });

  // A client can pass its own arguments to an exported server action.
  it('resolves from the default container in a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(
      await resolverWith('container')('from a client', {
        loadContainer: async () => ({ value: 'from a client' }),
      }),
    ).toBe('container');
  });
});
