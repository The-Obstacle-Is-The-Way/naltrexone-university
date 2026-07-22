import { describe, expect, it, vi } from 'vitest';
import packageJson from '@/package.json';
import {
  runNonProductionSeed,
  type SeedEnvironmentDependencies,
} from './seed-environment-targets';

function createDependencies(
  overrides: Partial<SeedEnvironmentDependencies> = {},
): SeedEnvironmentDependencies & {
  prepareCorpus: ReturnType<typeof vi.fn>;
  pullDatabaseUrl: ReturnType<typeof vi.fn>;
  seedDatabase: ReturnType<typeof vi.fn>;
} {
  const prepareCorpus = vi.fn(async () => {});
  const pullDatabaseUrl = vi.fn(
    overrides.pullDatabaseUrl ??
      (async (environment) => {
        if (environment === 'development') {
          return 'postgresql://dev-user:pw@dev-host/shared_nonprod';
        }
        if (environment === 'preview') {
          return 'postgresql://preview-user:pw@preview-host/previewdb';
        }
        return 'postgresql://prod-user:pw@prod-host/proddb';
      }),
  );
  const seedDatabase = vi.fn(async (_databaseUrl: string) => {});

  return {
    readLocalDatabaseUrl: async () =>
      'postgresql://local-user:pw@dev-host/shared_nonprod',
    log: vi.fn(),
    ...overrides,
    prepareCorpus,
    pullDatabaseUrl,
    seedDatabase,
  };
}

describe('db:seed:all', () => {
  it('resolves Production only as an exclusion fence and never seeds it', async () => {
    const dependencies = createDependencies();
    const acknowledgement =
      '["dev-host/shared_nonprod","preview-host/previewdb"]';

    await runNonProductionSeed({ acknowledgement, dependencies });

    expect(dependencies.pullDatabaseUrl.mock.calls).toEqual([
      ['development'],
      ['preview'],
      ['production'],
    ]);
    expect(dependencies.seedDatabase.mock.calls).toEqual([
      ['postgresql://local-user:pw@dev-host/shared_nonprod'],
      ['postgresql://preview-user:pw@preview-host/previewdb'],
    ]);
    expect(dependencies.seedDatabase.mock.calls.flat()).not.toContain(
      'postgresql://prod-user:pw@prod-host/proddb',
    );
  });

  it('fails on a mismatched target-set token before any corpus or database write', async () => {
    const dependencies = createDependencies();

    await expect(
      runNonProductionSeed({
        acknowledgement: '["dev-host/shared_nonprod"]',
        dependencies,
      }),
    ).rejects.toThrow(
      'DB_TARGET_ACK must exactly equal ["dev-host/shared_nonprod","preview-host/previewdb"]',
    );
    expect(dependencies.prepareCorpus).not.toHaveBeenCalled();
    expect(dependencies.seedDatabase).not.toHaveBeenCalled();
  });

  it('fails before writes when Production matches a non-production target', async () => {
    const dependencies = createDependencies({
      pullDatabaseUrl: async (environment) =>
        environment === 'production'
          ? 'postgresql://prod-user:pw@preview-host/previewdb'
          : environment === 'preview'
            ? 'postgresql://preview-user:pw@preview-host/previewdb'
            : 'postgresql://dev-user:pw@dev-host/shared_nonprod',
    });

    await expect(
      runNonProductionSeed({
        acknowledgement: '["dev-host/shared_nonprod","preview-host/previewdb"]',
        dependencies,
      }),
    ).rejects.toThrow(
      'Production DATABASE_URL matches a non-production target',
    );
    expect(dependencies.prepareCorpus).not.toHaveBeenCalled();
    expect(dependencies.seedDatabase).not.toHaveBeenCalled();
  });

  it('deduplicates confirmed non-production targets before seeding', async () => {
    const dependencies = createDependencies({
      pullDatabaseUrl: async (environment) =>
        environment === 'production'
          ? 'postgresql://prod-user:pw@prod-host/proddb'
          : 'postgresql://shared-user:pw@dev-host/shared_nonprod',
    });

    await runNonProductionSeed({
      acknowledgement: '["dev-host/shared_nonprod"]',
      dependencies,
    });

    expect(dependencies.seedDatabase).toHaveBeenCalledTimes(1);
    expect(dependencies.prepareCorpus).toHaveBeenCalledTimes(1);
  });

  it('prints the confirmed plan without preparing or seeding in plan-only mode', async () => {
    const dependencies = createDependencies();

    await runNonProductionSeed({
      acknowledgement: '["dev-host/shared_nonprod","preview-host/previewdb"]',
      dependencies,
      planOnly: true,
    });

    expect(dependencies.log).toHaveBeenCalledWith(
      '=== Plan complete (no imports or seeds run) ===',
    );
    expect(dependencies.prepareCorpus).not.toHaveBeenCalled();
    expect(dependencies.seedDatabase).not.toHaveBeenCalled();
  });

  it('keeps the package script on the checked-in batch wrapper', () => {
    expect(packageJson.scripts['db:seed:all']).toBe(
      'bash scripts/seed-all-environments.sh',
    );
  });
});
