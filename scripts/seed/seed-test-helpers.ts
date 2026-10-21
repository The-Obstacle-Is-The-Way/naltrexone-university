import type { SeedOptions } from './seed-options';

// Records each seed an entry point asks for, in place of a database.
export function recordSeeds() {
  const seeds: Array<{ databaseUrl: string; options: SeedOptions }> = [];
  return {
    seeds,
    seed: async (databaseUrl: string, options: SeedOptions) => {
      seeds.push({ databaseUrl, options });
    },
  };
}
