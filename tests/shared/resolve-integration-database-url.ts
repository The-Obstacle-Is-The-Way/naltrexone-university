import {
  isTruthyEnvFlag,
  type LocalTestTargetEnv,
  resolveLocalTestTarget,
} from '@/scripts/resolve-local-test-target';

type ResolveIntegrationDatabaseUrlInput = {
  env?: LocalTestTargetEnv;
  cwd?: string;
};

export function resolveIntegrationDatabaseUrl({
  env = process.env,
  cwd = process.cwd(),
}: ResolveIntegrationDatabaseUrlInput = {}): string {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for database session proofs');
  }

  if (isTruthyEnvFlag(env.CI)) {
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
