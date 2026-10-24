import { describe, expect, it } from 'vitest';
import { createDatabaseTargetPlan } from './database-target';
import { runDbSeed } from './db-seed';
import { recordSeeds } from './seed/seed-test-helpers';

const LOCAL_DATABASE_URL = 'postgresql://local@127.0.0.1:55432/app';
// Port 1 on loopback: the connection is refused at once.
const UNREACHABLE_LOCAL_DATABASE_URL = 'postgresql://local@127.0.0.1:1/app';
const REMOTE_DATABASE_URL = 'postgresql://remote@db.example:5432/app';
const REMOTE_ACK = createDatabaseTargetPlan([
  REMOTE_DATABASE_URL,
]).acknowledgement;

describe('db:seed placeholder choice', () => {
  it('seeds without the placeholder fixtures unless the command line asks', async () => {
    const { seeds, seed } = recordSeeds();

    await runDbSeed({
      env: { DATABASE_URL: LOCAL_DATABASE_URL },
      log: () => {},
      seed,
    });

    expect(seeds).toEqual([
      {
        databaseUrl: LOCAL_DATABASE_URL,
        options: { includePlaceholders: false },
      },
    ]);
  });

  it('passes --include-placeholders through to the seed', async () => {
    const { seeds, seed } = recordSeeds();

    await runDbSeed({
      args: ['--include-placeholders'],
      env: { DATABASE_URL: LOCAL_DATABASE_URL },
      log: () => {},
      seed,
    });

    expect(seeds.map(({ options }) => options)).toEqual([
      { includePlaceholders: true },
    ]);
  });

  // The default seed imports the real seed module only when called. With the
  // fixtures included it always reaches the database, so a loopback port that
  // nothing listens on proves the real seed ran its first query.
  it('runs the real seed when no seed is injected', async () => {
    await expect(
      runDbSeed({
        args: ['--include-placeholders'],
        env: { DATABASE_URL: UNREACHABLE_LOCAL_DATABASE_URL },
        log: () => {},
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/^Failed query/),
      cause: expect.objectContaining({ code: 'ECONNREFUSED' }),
    });
  });

  it('seeds an acknowledged remote target without the placeholder fixtures', async () => {
    const { seeds, seed } = recordSeeds();

    await runDbSeed({
      env: { DATABASE_URL: REMOTE_DATABASE_URL, DB_TARGET_ACK: REMOTE_ACK },
      log: () => {},
      seed,
    });

    expect(seeds).toEqual([
      {
        databaseUrl: REMOTE_DATABASE_URL,
        options: { includePlaceholders: false },
      },
    ]);
  });

  it('refuses the placeholder fixtures for a remote target, even when acknowledged', async () => {
    const { seeds, seed } = recordSeeds();

    await expect(
      runDbSeed({
        args: ['--include-placeholders'],
        env: { DATABASE_URL: REMOTE_DATABASE_URL, DB_TARGET_ACK: REMOTE_ACK },
        log: () => {},
        seed,
      }),
    ).rejects.toThrow(
      'db:seed adds the placeholder fixtures only to a local database, and db.example:5432/app is remote.',
    );

    expect(seeds).toEqual([]);
  });

  // An acknowledgment refusal prints the code that admits the target, so the
  // placeholder refusal must come first.
  it('refuses the placeholder fixtures for a remote target before asking for an acknowledgment', async () => {
    await expect(
      runDbSeed({
        args: ['--include-placeholders'],
        env: { DATABASE_URL: REMOTE_DATABASE_URL },
        log: () => {},
        seed: recordSeeds().seed,
      }),
    ).rejects.toThrow(/^db:seed adds the placeholder fixtures only/);
  });

  it('refuses an exported SEED_INCLUDE_PLACEHOLDERS before seeding', async () => {
    const { seeds, seed } = recordSeeds();

    await expect(
      runDbSeed({
        env: {
          DATABASE_URL: LOCAL_DATABASE_URL,
          SEED_INCLUDE_PLACEHOLDERS: 'true',
        },
        log: () => {},
        seed,
      }),
    ).rejects.toThrow(/SEED_INCLUDE_PLACEHOLDERS is set/);

    expect(seeds).toEqual([]);
  });
});
