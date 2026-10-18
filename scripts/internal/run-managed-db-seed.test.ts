import { describe, expect, it } from 'vitest';
import { recordSeeds } from '../seed/seed-test-helpers';
import { runManagedDbSeed } from './run-managed-db-seed';

const REMOTE_DATABASE_URL = 'postgresql://app@db.example/app';

// The environment seeds (db:seed:prod, db:seed:all) run this command with a
// copy of the operator's environment and no arguments (BUG-353).
describe('managed seed placeholder choice', () => {
  it('seeds a remote target without the placeholder fixtures when given no arguments', async () => {
    const { seeds, seed } = recordSeeds();

    await runManagedDbSeed({
      env: { DATABASE_URL: REMOTE_DATABASE_URL },
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

  it('refuses an inherited SEED_INCLUDE_PLACEHOLDERS before seeding', async () => {
    const { seeds, seed } = recordSeeds();

    await expect(
      runManagedDbSeed({
        env: {
          DATABASE_URL: REMOTE_DATABASE_URL,
          SEED_INCLUDE_PLACEHOLDERS: 'true',
        },
        log: () => {},
        seed,
      }),
    ).rejects.toThrow(/SEED_INCLUDE_PLACEHOLDERS is set/);

    expect(seeds).toEqual([]);
  });

  it('refuses the placeholder fixtures for a remote target', async () => {
    const { seeds, seed } = recordSeeds();

    await expect(
      runManagedDbSeed({
        args: ['--include-placeholders'],
        env: { DATABASE_URL: REMOTE_DATABASE_URL },
        log: () => {},
        seed,
      }),
    ).rejects.toThrow(
      'The managed seed adds the placeholder fixtures only to a local database, and db.example/app is remote.',
    );

    expect(seeds).toEqual([]);
  });

  it('includes the placeholder fixtures when a test lane passes --include-placeholders', async () => {
    const { seeds, seed } = recordSeeds();

    await runManagedDbSeed({
      args: ['--include-placeholders'],
      env: { DATABASE_URL: 'postgresql://ci@127.0.0.1:5432/ci' },
      log: () => {},
      seed,
    });

    expect(seeds.map(({ options }) => options)).toEqual([
      { includePlaceholders: true },
    ]);
  });
});
