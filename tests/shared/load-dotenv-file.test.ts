import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDotenvFileOrThrow } from './load-dotenv-file';
import { restoreProcessEnv, snapshotProcessEnv } from './process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

describe('loadDotenvFileOrThrow', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  it('throws when dotenv file cannot be loaded', () => {
    expect(() => loadDotenvFileOrThrow('/path/does/not/exist')).toThrow();
  });

  it('loads environment variables from a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nu-test-env-'));
    try {
      const envPath = join(dir, '.env');
      await writeFile(envPath, 'TEST_ENV_LOADED=1\n');
      delete process.env.TEST_ENV_LOADED;

      loadDotenvFileOrThrow(envPath);

      expect(process.env.TEST_ENV_LOADED).toBe('1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('overrides existing environment variables from a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nu-test-env-override-'));
    try {
      const envPath = join(dir, '.env');
      await writeFile(envPath, 'TEST_ENV_LOADED=1\n');
      process.env.TEST_ENV_LOADED = '2';

      loadDotenvFileOrThrow(envPath, { override: true });

      expect(process.env.TEST_ENV_LOADED).toBe('1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
