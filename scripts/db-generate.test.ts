import { describe, expect, it } from 'vitest';
import { runDbGenerate } from './db-generate';

describe('db:generate target boundary', () => {
  it('refuses an implicit dotenv target before starting Drizzle Kit', async () => {
    let processStarted = false;

    await expect(
      runDbGenerate({
        env: {},
        runProcess: async () => {
          processStarted = true;
        },
      }),
    ).rejects.toThrow(/explicit DATABASE_URL.*implicit.*fallback/i);

    expect(processStarted).toBe(false);
  });

  it('refuses an unacknowledged remote target before starting Drizzle Kit', async () => {
    let processStarted = false;

    await expect(
      runDbGenerate({
        env: {
          DATABASE_URL:
            'postgresql://remote-user:remote-password@db.example/app',
        },
        runProcess: async () => {
          processStarted = true;
        },
      }),
    ).rejects.toThrow('DB_TARGET_ACK must exactly equal ["db.example/app"]');

    expect(processStarted).toBe(false);
  });

  it('runs generation against an approved explicit target with a redacted receipt', async () => {
    const databaseUrl =
      'postgresql://local-user:local-password@127.0.0.1:55432/app';
    const calls: Array<{ args: readonly string[]; databaseUrl: string }> = [];
    const logs: string[] = [];

    await runDbGenerate({
      env: { DATABASE_URL: databaseUrl },
      runProcess: async (args, targetUrl) => {
        calls.push({ args, databaseUrl: targetUrl });
      },
      log: (message) => logs.push(message),
    });

    expect(calls).toEqual([
      {
        args: ['exec', 'drizzle-kit', 'generate'],
        databaseUrl,
      },
    ]);
    expect(logs).toEqual(['Database target: LOCAL 127.0.0.1:55432/app']);
    expect(JSON.stringify(logs)).not.toContain('local-user');
    expect(JSON.stringify(logs)).not.toContain('local-password');
  });

  it('forwards Drizzle Kit options after target authorization', async () => {
    const calls: Array<{ args: readonly string[]; databaseUrl: string }> = [];

    await runDbGenerate({
      args: ['--name=add-practice-index'],
      env: {
        DATABASE_URL:
          'postgresql://local-user:local-password@127.0.0.1:55432/app',
      },
      runProcess: async (args, databaseUrl) => {
        calls.push({ args, databaseUrl });
      },
      log: () => {},
    });

    expect(calls[0]?.args).toEqual([
      'exec',
      'drizzle-kit',
      'generate',
      '--name=add-practice-index',
    ]);
  });
});
