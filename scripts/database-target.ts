export type DatabaseTargetKind = 'LOCAL' | 'REMOTE';

export type DatabaseTarget = {
  kind: DatabaseTargetKind;
  display: string;
};

export type DatabaseTargetPlan = {
  targets: DatabaseTarget[];
  acknowledgement: string;
};

type DatabaseTargetEnv = Readonly<Record<string, string | undefined>>;

type HumanDatabaseTargetInput = {
  databaseUrls: readonly string[];
  acknowledgement?: string | undefined;
};

export function requireExplicitDatabaseUrl(env: DatabaseTargetEnv): string {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'An explicit DATABASE_URL is required; implicit dotenv fallback is refused.',
    );
  }

  return databaseUrl;
}

export function classifyDatabaseTarget(databaseUrl: string): DatabaseTarget {
  const parsed = parseDatabaseUrl(databaseUrl);
  const hostname = normalizeHostname(parsed.hostname);
  const databaseName = parsed.pathname.replace(/^\/+/, '');
  if (!hostname || !databaseName) {
    throw new Error('The explicitly supplied DATABASE_URL is invalid.');
  }

  return {
    kind: isLoopbackHostname(hostname) ? 'LOCAL' : 'REMOTE',
    display: `${parsed.host}/${databaseName}`,
  };
}

export function serializeRemoteDatabaseTargets(
  databaseUrls: readonly string[],
): string {
  const remoteTargets = databaseUrls
    .map(classifyDatabaseTarget)
    .filter((target) => target.kind === 'REMOTE')
    .map((target) => target.display);

  return JSON.stringify([...new Set(remoteTargets)].sort());
}

export function createDatabaseTargetPlan(
  databaseUrls: readonly string[],
): DatabaseTargetPlan {
  if (databaseUrls.length === 0) {
    throw new Error('At least one explicit DATABASE_URL is required.');
  }

  return {
    targets: databaseUrls.map(classifyDatabaseTarget),
    acknowledgement: serializeRemoteDatabaseTargets(databaseUrls),
  };
}

export function authorizeHumanDatabaseTargets({
  databaseUrls,
  acknowledgement,
}: HumanDatabaseTargetInput): DatabaseTargetPlan {
  const plan = createDatabaseTargetPlan(databaseUrls);
  if (
    plan.acknowledgement !== '[]' &&
    acknowledgement !== plan.acknowledgement
  ) {
    throw new Error(
      `DB_TARGET_ACK must exactly equal ${plan.acknowledgement} for the remote database target set.`,
    );
  }

  return plan;
}

function parseDatabaseUrl(databaseUrl: string): URL {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new Error('Unsupported database protocol');
    }
    return parsed;
  } catch {
    // Suppress parser/protocol details so every invalid URL uses one stable,
    // credential-free operator error.
    throw new Error('The explicitly supplied DATABASE_URL is invalid.');
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}
