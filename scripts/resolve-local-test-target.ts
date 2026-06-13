import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type LocalTestTargetEnv = Readonly<Record<string, string | undefined>>;

export type LocalTestTarget = {
  instanceId: string;
  composeProjectName: string;
  dbHost: '127.0.0.1';
  dbPort: string;
  dbName: 'addiction_boards_test';
  databaseUrl: string;
  appHost: '127.0.0.1';
  appPort: string;
  appUrl: string;
  lockPath: string;
};

export type LocalTestTargetOutputFormat =
  | 'json'
  | 'database-url'
  | 'app-url'
  | 'env';

type ResolveLocalTestTargetInput = {
  env?: LocalTestTargetEnv;
  cwd?: string;
};

const LOCAL_TEST_DB_HOST = '127.0.0.1';
const LOCAL_TEST_DB_USER = 'postgres';
const LOCAL_TEST_DB_PASSWORD = 'postgres';
const LOCAL_TEST_DB_NAME = 'addiction_boards_test';
const LOCAL_TEST_APP_HOST = '127.0.0.1';
const LOCAL_TEST_APP_BASE_PORT = 3100;
const LOCAL_TEST_DB_BASE_PORT = 55400;
const LOCAL_TEST_PORT_SLOTS = 500;
const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes']);

export function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

export function resolveLocalTestTarget({
  env = process.env,
  cwd = process.cwd(),
}: ResolveLocalTestTargetInput = {}): LocalTestTarget {
  const absoluteCwd = resolve(cwd);
  const explicitInstance =
    env.LOCAL_TEST_INSTANCE?.trim() || env.E2E_INSTANCE?.trim();
  const instanceId = explicitInstance
    ? sanitizeExplicitInstanceId(explicitInstance)
    : deriveInstanceIdFromWorktree(absoluteCwd);
  const offset = derivePortOffset(instanceId);
  const dbPort = resolvePort({
    env,
    keys: ['DB_TEST_PORT'],
    fallbackPort: LOCAL_TEST_DB_BASE_PORT + offset,
  });
  const appPort = resolvePort({
    env,
    keys: ['LOCAL_TEST_APP_PORT', 'E2E_APP_PORT', 'PORT'],
    fallbackPort: LOCAL_TEST_APP_BASE_PORT + offset,
  });
  const composeProjectName = `naltrexone-test-${instanceId}`;
  const databaseUrl = `postgresql://${LOCAL_TEST_DB_USER}:${LOCAL_TEST_DB_PASSWORD}@${LOCAL_TEST_DB_HOST}:${dbPort}/${LOCAL_TEST_DB_NAME}`;
  const appUrl = `http://${LOCAL_TEST_APP_HOST}:${appPort}`;

  return {
    instanceId,
    composeProjectName,
    dbHost: LOCAL_TEST_DB_HOST,
    dbPort,
    dbName: LOCAL_TEST_DB_NAME,
    databaseUrl,
    appHost: LOCAL_TEST_APP_HOST,
    appPort,
    appUrl,
    lockPath: join(
      tmpdir(),
      'naltrexone-university-local-tests',
      `${composeProjectName}.lock`,
    ),
  };
}

export function createLocalTestTargetEnv(
  target: LocalTestTarget,
): Record<string, string> {
  return {
    COMPOSE_PROJECT_NAME: target.composeProjectName,
    DATABASE_URL: target.databaseUrl,
    DB_TEST_PORT: target.dbPort,
    LOCAL_TEST_INSTANCE: target.instanceId,
    NEXT_PUBLIC_APP_URL: target.appUrl,
    PORT: target.appPort,
  };
}

export function formatLocalTestTargetOutput(
  target: LocalTestTarget,
  format: LocalTestTargetOutputFormat = 'json',
): string {
  if (format === 'database-url') return target.databaseUrl;
  if (format === 'app-url') return target.appUrl;
  if (format === 'env') {
    return Object.entries(createLocalTestTargetEnv(target))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }

  return JSON.stringify(target, null, 2);
}

function deriveInstanceIdFromWorktree(absoluteCwd: string): string {
  const name = sanitizeInstanceId(basename(absoluteCwd));
  const hash = hashText(absoluteCwd).slice(0, 8);
  return `${name}-${hash}`;
}

function derivePortOffset(instanceId: string): number {
  return (
    Number.parseInt(hashText(instanceId).slice(0, 8), 16) %
    LOCAL_TEST_PORT_SLOTS
  );
}

function resolvePort({
  env,
  keys,
  fallbackPort,
}: {
  env: LocalTestTargetEnv;
  keys: string[];
  fallbackPort: number;
}): string {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return validatePortOverride(key, value);
  }

  return String(fallbackPort);
}

function validatePortOverride(key: string, value: string): string {
  const errorMessage = `${key} must be an integer TCP port between 1 and 65535.`;
  if (!/^\d+$/.test(value)) {
    throw new Error(errorMessage);
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(errorMessage);
  }

  return String(port);
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeInstanceId(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return sanitized || 'local';
}

function sanitizeExplicitInstanceId(value: string): string {
  if (!/[a-z0-9]/i.test(value)) {
    throw new Error(
      'LOCAL_TEST_INSTANCE/E2E_INSTANCE must include at least one alphanumeric character.',
    );
  }

  return sanitizeInstanceId(value);
}

export function parseOutputFormat(
  value: string | undefined,
): LocalTestTargetOutputFormat {
  if (
    value === undefined ||
    value === 'json' ||
    value === 'database-url' ||
    value === 'app-url' ||
    value === 'env'
  ) {
    return value ?? 'json';
  }

  throw new Error(`Unknown local test target output format "${value}".`);
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  try {
    const format = parseOutputFormat(process.argv[2]);
    console.log(formatLocalTestTargetOutput(resolveLocalTestTarget(), format));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
/* v8 ignore stop */
