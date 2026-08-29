import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import packageJson from '@/package.json';
import { runHumanDatabaseCommand } from './database-command';
import { runManagedDatabaseCommand } from './internal/database-command-managed';

describe('database command target boundary', () => {
  it('fails before execution when DATABASE_URL would come from fallback config', async () => {
    const execute = vi.fn(async (_databaseUrl: string) => {});

    await expect(runHumanDatabaseCommand({ env: {}, execute })).rejects.toThrow(
      /explicit DATABASE_URL/i,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes an explicit local target and prints only its redacted identity', async () => {
    const databaseUrl =
      'postgresql://local-user:local-password@127.0.0.1:55432/app';
    const execute = vi.fn(async (_databaseUrl: string) => {});
    const log = vi.fn();

    await runHumanDatabaseCommand({
      env: { DATABASE_URL: databaseUrl },
      execute,
      log,
    });

    expect(execute).toHaveBeenCalledWith(databaseUrl);
    expect(log).toHaveBeenCalledWith(
      'Database target: LOCAL 127.0.0.1:55432/app',
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('local-password');
  });

  it('fails before execution when remote acknowledgement is missing', async () => {
    const execute = vi.fn(async (_databaseUrl: string) => {});

    await expect(
      runHumanDatabaseCommand({
        env: {
          DATABASE_URL:
            'postgresql://remote-user:remote-password@db.example/app',
        },
        execute,
      }),
    ).rejects.toThrow('DB_TARGET_ACK must exactly equal ["db.example/app"]');
    expect(execute).not.toHaveBeenCalled();
  });

  it('lets an internal managed wrapper execute an explicit remote target without a human token', async () => {
    const databaseUrl =
      'postgresql://remote-user:remote-password@db.example/app';
    const execute = vi.fn(async (_databaseUrl: string) => {});

    await runManagedDatabaseCommand({ databaseUrl, execute, log: vi.fn() });

    expect(execute).toHaveBeenCalledWith(databaseUrl);
  });

  it('routes generate, migrate, studio, and seed through thin human wrappers with no managed flag', () => {
    expect(packageJson.scripts['db:generate']).toBe(
      'tsx scripts/db-generate.ts',
    );
    expect(packageJson.scripts['db:migrate']).toBe('tsx scripts/db-migrate.ts');
    expect(packageJson.scripts['db:studio']).toBe('tsx scripts/db-studio.ts');
    expect(packageJson.scripts['db:seed']).toBe('tsx scripts/db-seed.ts');

    for (const file of [
      'scripts/db-generate.ts',
      'scripts/db-migrate.ts',
      'scripts/db-studio.ts',
      'scripts/db-seed.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('runHumanDatabaseCommand');
      expect(source).not.toContain('--managed');
      expect(source).not.toContain('DB_TARGET_MODE');
      expect(source).not.toContain('runManagedDatabaseCommand');
    }
  });
});
