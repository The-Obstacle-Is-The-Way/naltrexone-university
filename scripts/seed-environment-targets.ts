import {
  authorizeHumanDatabaseTargets,
  classifyDatabaseTarget,
} from './database-target';

export type VercelSeedEnvironment = 'development' | 'preview' | 'production';

export type SeedEnvironmentDependencies = {
  readLocalDatabaseUrl: () => Promise<string>;
  pullDatabaseUrl: (environment: VercelSeedEnvironment) => Promise<string>;
  prepareCorpus: () => Promise<void>;
  seedDatabase: (databaseUrl: string) => Promise<void>;
  log: (message: string) => void;
};

type NonProductionSeedInput = {
  acknowledgement?: string | undefined;
  dependencies: SeedEnvironmentDependencies;
  planOnly?: boolean;
};

type ProductionSeedInput = NonProductionSeedInput & {
  env?: Readonly<Record<string, string | undefined>>;
};

type ResolvedSeedTarget = {
  databaseUrl: string;
  display: string;
  labels: string[];
};

export async function runNonProductionSeed({
  acknowledgement,
  dependencies,
  planOnly = false,
}: NonProductionSeedInput): Promise<void> {
  const [local, development, preview, production] = await Promise.all([
    dependencies.readLocalDatabaseUrl(),
    dependencies.pullDatabaseUrl('development'),
    dependencies.pullDatabaseUrl('preview'),
    dependencies.pullDatabaseUrl('production'),
  ]);
  const productionDisplay = classifyDatabaseTarget(production).display;
  const nonProductionTargets = deduplicateTargets([
    { label: 'local (.env.local)', databaseUrl: local },
    { label: 'Vercel development', databaseUrl: development },
    { label: 'Vercel preview', databaseUrl: preview },
  ]);

  if (
    nonProductionTargets.some((target) => target.display === productionDisplay)
  ) {
    throw new Error(
      'Production DATABASE_URL matches a non-production target. Refusing to seed.',
    );
  }

  authorizeHumanDatabaseTargets({
    databaseUrls: nonProductionTargets.map((target) => target.databaseUrl),
    acknowledgement,
  });
  logNonProductionPlan(dependencies, nonProductionTargets, productionDisplay);

  if (planOnly) {
    dependencies.log('=== Plan complete (no imports or seeds run) ===');
    return;
  }

  await dependencies.prepareCorpus();
  for (const target of nonProductionTargets) {
    await dependencies.seedDatabase(target.databaseUrl);
  }
}

export async function runProductionSeed({
  acknowledgement,
  dependencies,
  env = process.env,
  planOnly = false,
}: ProductionSeedInput): Promise<void> {
  if (env.DATABASE_URL !== undefined) {
    throw new Error(
      'db:seed:prod refuses caller-supplied DATABASE_URL; it resolves the named Vercel Production identity.',
    );
  }

  const production = await dependencies.pullDatabaseUrl('production');
  const authorization = authorizeHumanDatabaseTargets({
    databaseUrls: [production],
    acknowledgement,
  });
  const target = authorization.targets[0];
  if (!target) {
    throw new Error('Vercel Production did not resolve a database target.');
  }

  dependencies.log('=== Production seed target ===');
  dependencies.log(`- Vercel production -> ${target.display}`);

  if (planOnly) {
    dependencies.log('=== Plan complete (no imports or seeds run) ===');
    return;
  }

  await dependencies.prepareCorpus();
  await dependencies.seedDatabase(production);
}

function deduplicateTargets(
  candidates: readonly { label: string; databaseUrl: string }[],
): ResolvedSeedTarget[] {
  const byDisplay = new Map<string, ResolvedSeedTarget>();

  for (const candidate of candidates) {
    const display = classifyDatabaseTarget(candidate.databaseUrl).display;
    const existing = byDisplay.get(display);
    if (existing) {
      existing.labels.push(candidate.label);
      continue;
    }

    byDisplay.set(display, {
      databaseUrl: candidate.databaseUrl,
      display,
      labels: [candidate.label],
    });
  }

  return [...byDisplay.values()];
}

function logNonProductionPlan(
  dependencies: SeedEnvironmentDependencies,
  targets: readonly ResolvedSeedTarget[],
  productionDisplay: string,
): void {
  dependencies.log('=== Non-production seed target plan ===');
  for (const target of targets) {
    dependencies.log(`- ${target.labels.join(', ')} -> ${target.display}`);
  }
  dependencies.log(
    `- Vercel production exclusion fence (not seeded) -> ${productionDisplay}`,
  );
}
