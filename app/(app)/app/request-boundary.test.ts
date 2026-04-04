import { afterEach, describe, expect, it, vi } from 'vitest';

describe('app/(app)/app/request-boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns immediately in test environments', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const { awaitRequestBoundary } = await import('./request-boundary');

    await expect(awaitRequestBoundary()).resolves.toBeUndefined();
  });

  it('awaits next/server connection outside tests', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const connection = vi.fn(async () => undefined);
    vi.doMock('next/server', () => ({
      connection,
    }));

    const { awaitRequestBoundary } = await import('./request-boundary');

    await expect(awaitRequestBoundary()).resolves.toBeUndefined();
    expect(connection).toHaveBeenCalledTimes(1);
  });
});
