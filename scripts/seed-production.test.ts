import { describe, expect, it, vi } from 'vitest';
import packageJson from '@/package.json';
import {
  runProductionSeed,
  type SeedEnvironmentDependencies,
} from './seed-environment-targets';

function createDependencies(): SeedEnvironmentDependencies & {
  prepareCorpus: ReturnType<typeof vi.fn>;
  pullDatabaseUrl: ReturnType<typeof vi.fn>;
  seedDatabase: ReturnType<typeof vi.fn>;
} {
  return {
    readLocalDatabaseUrl: async () => {
      throw new Error('Production seed must not read the local target');
    },
    pullDatabaseUrl: vi.fn(async (environment) => {
      if (environment !== 'production') {
        throw new Error(`Unexpected environment ${environment}`);
      }
      return 'postgresql://prod-user:prod-password@prod-host/proddb';
    }),
    prepareCorpus: vi.fn(async () => {}),
    seedDatabase: vi.fn(async (_databaseUrl: string) => {}),
    log: vi.fn(),
  };
}

describe('db:seed:prod', () => {
  it.each([undefined, '["wrong-host/proddb"]'])(
    'requires the exact Production target token %s before writes',
    async (acknowledgement) => {
      const dependencies = createDependencies();

      await expect(
        runProductionSeed({
          acknowledgement,
          dependencies,
          env: {},
        }),
      ).rejects.toThrow(
        'DB_TARGET_ACK must exactly equal ["prod-host/proddb"]',
      );
      expect(dependencies.prepareCorpus).not.toHaveBeenCalled();
      expect(dependencies.seedDatabase).not.toHaveBeenCalled();
    },
  );

  it('resolves and seeds only the named Production identity after exact consent', async () => {
    const dependencies = createDependencies();

    await runProductionSeed({
      acknowledgement: '["prod-host/proddb"]',
      dependencies,
      env: {},
    });

    expect(dependencies.prepareCorpus).toHaveBeenCalledTimes(1);
    expect(dependencies.seedDatabase).toHaveBeenCalledWith(
      'postgresql://prod-user:prod-password@prod-host/proddb',
    );
  });

  it('refuses a caller-supplied DATABASE_URL before resolving or writing', async () => {
    const dependencies = createDependencies();
    await expect(
      runProductionSeed({
        acknowledgement: '["prod-host/proddb"]',
        dependencies,
        env: {
          DATABASE_URL: 'postgresql://caller:password@arbitrary.example/app',
        },
      }),
    ).rejects.toThrow('db:seed:prod refuses caller-supplied DATABASE_URL');
    expect(dependencies.pullDatabaseUrl).not.toHaveBeenCalled();
    expect(dependencies.prepareCorpus).not.toHaveBeenCalled();
    expect(dependencies.seedDatabase).not.toHaveBeenCalled();
  });

  it('prints the confirmed Production plan without preparing or seeding in plan-only mode', async () => {
    const dependencies = createDependencies();

    await runProductionSeed({
      acknowledgement: '["prod-host/proddb"]',
      dependencies,
      env: {},
      planOnly: true,
    });

    expect(dependencies.log).toHaveBeenCalledWith(
      '=== Plan complete (no imports or seeds run) ===',
    );
    expect(dependencies.prepareCorpus).not.toHaveBeenCalled();
    expect(dependencies.seedDatabase).not.toHaveBeenCalled();
  });

  it('registers the dedicated Production command', () => {
    expect(packageJson.scripts['db:seed:prod']).toBe(
      'tsx scripts/seed-production.ts',
    );
  });
});
