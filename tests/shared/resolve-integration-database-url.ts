import {
  isTruthyEnvFlag,
  type LocalTestTargetEnv,
  resolveLocalTestTarget,
} from '@/scripts/resolve-local-test-target';

type ResolveIntegrationDatabaseUrlInput = {
  env?: LocalTestTargetEnv;
  cwd?: string;
};

const CI_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const CI_DATABASE_PORT = '5432';
const CI_DATABASE_NAME = 'addiction_boards_test';

export function resolveIntegrationDatabaseUrl({
  env = process.env,
  cwd = process.cwd(),
}: ResolveIntegrationDatabaseUrlInput = {}): string {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for database session proofs');
  }

  if (isTruthyEnvFlag(env.CI)) {
    if (!isAllowlistedCiDatabaseUrl(databaseUrl)) {
      throw new Error(
        'Database session proofs require the allowlisted CI-local test target.',
      );
    }
    return databaseUrl;
  }

  const localTarget = resolveLocalTestTarget({ env, cwd });
  if (databaseUrl !== localTarget.databaseUrl) {
    throw new Error(
      'Database session proofs require the resolver-scoped local test target.',
    );
  }

  return databaseUrl;
}

function isAllowlistedCiDatabaseUrl(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    const databaseName = parsed.pathname.replace(/^\/+/, '');
    const port = parsed.port || CI_DATABASE_PORT;
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return (
      (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') &&
      CI_DATABASE_HOSTS.has(hostname) &&
      port === CI_DATABASE_PORT &&
      databaseName === CI_DATABASE_NAME
    );
  } catch {
    // The caller receives the same credential-free CI target error for every
    // malformed or non-allowlisted URL.
    return false;
  }
}
