import { afterEach, describe, expect, it, vi } from 'vitest';

async function importLogger() {
  vi.resetModules();
  return import('@/lib/logger');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logger', () => {
  it('uses LOG_LEVEL when provided', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'warn');

    const { logger } = await importLogger();

    expect(logger.level).toBe('warn');
  });

  it('defaults to silent in test environment when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('silent');
  });

  it('defaults to info in production when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('info');
  });

  it('defaults to debug in development when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('debug');
  });
});
