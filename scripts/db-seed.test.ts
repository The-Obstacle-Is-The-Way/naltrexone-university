import { describe, expect, it } from 'vitest';
import { runDbSeed } from './db-seed';
import type { SeedOptions } from './seed/seed-options';

const LOCAL_DATABASE_URL = 'postgresql://local@127.0.0.1:55432/app';

function recordSeeds() {
  const seeds: Array<{ databaseUrl: string; options: SeedOptions }> = [];
  return {
    seeds,
    seed: async (databaseUrl: string, options: SeedOptions) => {
      seeds.push({ databaseUrl, options });
    },
  };
}

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
