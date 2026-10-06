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

  it('uses dependencies a caller injects', async () => {
    expect(await resolverWith('container')('injected')).toBe('injected');
  });

  it('uses a container a caller supplies', async () => {
    expect(
      await resolverWith('container')(undefined, {
        loadContainer: async () => ({ value: 'custom' }),
      }),
    ).toBe('custom');
  });

  // Only server code reaches the resolver: the 'use server' wrappers pass a
  // client's input alone (BUG-324). So injection works in every build.
  it('uses injected dependencies in a production build too', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(await resolverWith('container')('injected')).toBe('injected');
  });

  it('resolves from the default container when nothing is injected', async () => {
    expect(await resolverWith('container')()).toBe('container');
  });
});
