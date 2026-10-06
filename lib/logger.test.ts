import { readFileSync } from 'node:fs';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHealthHandler } from '@/app/api/health/handler';
import { handleError } from '@/src/adapters/controllers/action-result';
import type { Logger, LoggerContext } from '@/src/application/ports/logger';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';

vi.mock('server-only', () => ({}));

function createSerializedLogger() {
  const lines: string[] = [];
  const destination = {
    write(line: string) {
      lines.push(line);
    },
  };
  const pinoLogger = pino(
    { level: 'error', base: null, timestamp: false },
    destination,
  );
  const logger: Logger = {
    debug: (context: LoggerContext, msg: string) =>
      pinoLogger.debug(context, msg),
    info: (context: LoggerContext, msg: string) =>
      pinoLogger.info(context, msg),
    warn: (context: LoggerContext, msg: string) =>
      pinoLogger.warn(context, msg),
    error: (context: LoggerContext, msg: string) =>
      pinoLogger.error(context, msg),
  };

  return { lines, logger };
}

async function importLogger() {
  vi.resetModules();
  return import('@/lib/logger');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logger', () => {
  it('serializes safe diagnostics for real Drizzle failures through err and error seams', async () => {
    const sentinelEmail = 'projector-sentinel@example.com';
    const sqlText = 'insert into users (email) values ($1)';
    const rawCauseMessage = 'duplicate key value violates unique constraint';
    const rawCauseDetail = `Key (email)=(${sentinelEmail}) already exists`;
    const postgresError = Object.assign(new Error(rawCauseMessage), {
      code: '23505',
      constraint: 'users_email_uq',
      detail: rawCauseDetail,
    });
    const drizzleError = new DrizzleQueryError(
      sqlText,
      [sentinelEmail],
      postgresError,
    );
    const { lines, logger } = createSerializedLogger();

    handleError(drizzleError, { logger });
    const { POST } = createHealthHandler({
      db: {
        execute: async () => {
          throw drizzleError;
        },
      },
      logger,
      rateLimiter: new FakeRateLimiter(),
    });
    await POST(new Request('http://localhost/api/health', { method: 'POST' }));

    expect(lines).toHaveLength(2);
    const serialized = lines.join('');
    expect(serialized).not.toContain(sentinelEmail);
    expect(serialized).not.toContain(sqlText);
    expect(serialized).not.toContain(rawCauseMessage);
    expect(serialized).not.toContain(rawCauseDetail);
    expect(serialized).not.toContain('params:');
    expect(serialized).not.toContain('"params"');
    expect(serialized).not.toContain('"stack"');

    const records = lines.map((line) => JSON.parse(line));
    const diagnostics = {
      name: 'DrizzleQueryError',
      sqlState: '23505',
      constraint: 'users_email_uq',
    };
    expect(records[0]?.err).toEqual(diagnostics);
    expect(records[1]?.error).toEqual(diagnostics);
  });

  // BUG-325: a secret env var attached to a log by mistake must not reach the
  // logs. The list is checked against the env schema, so a new secret has to
  // join it.
  it('names every secret the env schema declares', async () => {
    const { SECRET_ENV_NAMES } = await importLogger();
    const schemaKeys = [
      ...readFileSync('lib/env.ts', 'utf8').matchAll(
        /^\s+([A-Z][A-Z0-9_]+):/gm,
      ),
    ].map((match) => match[1] ?? '');
    const secrets = schemaKeys.filter(
      (name) =>
        !name.startsWith('NEXT_PUBLIC_') &&
        /SECRET|_KEY$|TOKEN|DATABASE_URL/.test(name),
    );

    expect(secrets.length).toBeGreaterThanOrEqual(10);
    expect(secrets.filter((name) => !SECRET_ENV_NAMES.includes(name))).toEqual(
      [],
    );
  });

  it('removes a secret logged at the top level or one level down', async () => {
    const { LOGGER_REDACT_PATHS } = await importLogger();
    const lines: string[] = [];
    const redacting = pino(
      {
        level: 'info',
        base: null,
        timestamp: false,
        redact: { paths: [...LOGGER_REDACT_PATHS], remove: true },
      },
      { write: (line: string) => lines.push(line) },
    );

    redacting.info(
      {
        CRON_SECRET: 'secret-top',
        env: { DATABASE_URL: 'secret-env' },
        config: { STRIPE_SECRET_KEY: 'secret-nested' },
        kept: 'visible',
      },
      'attached by mistake',
    );

    expect(lines.join('')).toContain('visible');
    expect(lines.join('')).not.toMatch(/secret-(top|env|nested)/);
  });

  it('uses LOG_LEVEL when provided', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'warn');

    const { logger } = await importLogger();

    expect(logger.level).toBe('warn');
  });

  it('defaults to silent in test environment when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('silent');
  });

  it('defaults to info in production when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('info');
  });

  it('defaults to debug in Vercel preview when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('debug');
  });

  it('defaults to info in Vercel production when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('info');
  });

  it('defaults to debug in development when LOG_LEVEL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', '');

    const { logger } = await importLogger();

    expect(logger.level).toBe('debug');
  });
});
