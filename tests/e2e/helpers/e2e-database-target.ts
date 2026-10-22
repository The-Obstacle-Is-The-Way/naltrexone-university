import postgres from 'postgres';

// BUG-360: E2E setup, resets and evidence helpers write to the shared test
// user's rows. `pnpm test:e2e` checks the database before Playwright starts,
// but Playwright can start without it and read DATABASE_URL from .env.local,
// so every connection the E2E code opens passes its URL through here.
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// The values scripts/resolve-local-test-target.ts treats as an opt-in.
const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes']);

export type E2EDatabaseTargetRefusal = { message: string; fix: string };

type TargetEnv = Readonly<Record<string, string | undefined>>;

const FIX =
  "Run E2E through pnpm test:e2e, which supplies this clone's local database. " +
  'Set ALLOW_NON_LOCAL_DATABASE_URL=true only for an intentional ' +
  'non-production deploy-target check (BUG-360).';

// Neither field repeats the URL, which may carry credentials.
export function e2eDatabaseTargetRefusal(
  databaseUrl: string,
  env: TargetEnv,
): E2EDatabaseTargetRefusal | null {
  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    return { message: 'DATABASE_URL is not a valid URL.', fix: FIX };
  }
  if (LOCAL_DATABASE_HOSTS.has(hostname)) return null;
  const optIn = env.ALLOW_NON_LOCAL_DATABASE_URL?.trim().toLowerCase();
  if (optIn && TRUTHY_ENV_VALUES.has(optIn)) return null;
  return {
    message: `DATABASE_URL targets the non-local host "${hostname}".`,
    fix: FIX,
  };
}

export function guardE2EDatabaseUrl(
  databaseUrl: string,
  env: TargetEnv = process.env,
): string {
  const refusal = e2eDatabaseTargetRefusal(databaseUrl, env);
  if (refusal) throw new Error(`${refusal.message} ${refusal.fix}`);
  return databaseUrl;
}

// The only E2E code that loads the postgres client, which
// tests/e2e-database-connections.test.ts enforces.
export function connectE2EDatabase(
  databaseUrl: string,
  env: TargetEnv = process.env,
): postgres.Sql {
  return postgres(guardE2EDatabaseUrl(databaseUrl, env), { max: 1 });
}
