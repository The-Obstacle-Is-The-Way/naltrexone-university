import { isLoopbackHostname } from '../lib/loopback-hostname';
// Only repository-owned input diagnostics carry this type; callers may report
// its message without exposing an arbitrary transport error.
export class DatabaseTargetInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseTargetInputError';
  }
}

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
    throw new DatabaseTargetInputError(
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
    throw new DatabaseTargetInputError(
      'The explicitly supplied DATABASE_URL is invalid.',
    );
  }

  return {
    // Human commands have always accepted 127/8; test lanes do not.
    kind:
      isLoopbackHostname(hostname) || /^127(?:\.\d{1,3}){3}$/.test(hostname)
        ? 'LOCAL'
        : 'REMOTE',
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
    throw new DatabaseTargetInputError(
      'At least one explicit DATABASE_URL is required.',
    );
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
    throw new DatabaseTargetInputError(
      `DB_TARGET_ACK must exactly equal ${plan.acknowledgement} for the remote database target set.`,
    );
  }

  return plan;
}

function parseDatabaseUrl(databaseUrl: string): URL {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new DatabaseTargetInputError('Unsupported database protocol');
    }
    return parsed;
  } catch {
    // Suppress parser/protocol details so every invalid URL uses one stable,
    // credential-free operator error.
    throw new DatabaseTargetInputError(
      'The explicitly supplied DATABASE_URL is invalid.',
    );
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}
