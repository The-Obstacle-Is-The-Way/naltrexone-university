import { once } from 'node:events';
import { createConnection } from 'node:net';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POSTGRES_CONNECTION_PARAMETERS } from '@/lib/db-connection-options';
import { resolveIntegrationDatabaseUrl } from '@/tests/shared/resolve-integration-database-url';

const databaseUrl = resolveIntegrationDatabaseUrl();

const TEST_STATEMENT_TIMEOUT = '100ms';
const TEST_LOCK_TIMEOUT = '100ms';
const TEST_IDLE_TRANSACTION_TIMEOUT = '100ms';
const TEST_LONG_OPERATION_SECONDS = 1;
const TEST_IDLE_WAIT_MS = 250;
const LOCK_KEY = 44_701;

function createTestConnection(overrides: Readonly<Record<string, string>>) {
  return postgres(databaseUrl, {
    max: 1,
    connection: {
      ...POSTGRES_CONNECTION_PARAMETERS,
      ...overrides,
    },
  });
}

function createProtocolStateCaptureConnection(
  overrides: Readonly<Record<string, string>>,
): {
  sql: ReturnType<typeof postgres>;
  observedSqlStates: string[];
} {
  const observedSqlStates: string[] = [];
  let protocolBytes = Buffer.alloc(0);
  const options = {
    max: 1,
    connection: {
      ...POSTGRES_CONNECTION_PARAMETERS,
      ...overrides,
    },
    socket: async ({
      host: [host],
      port: [port],
    }: {
      host: string[];
      port: number[];
    }) => {
      if (!host || !port) {
        throw new Error('Postgres socket host and port are required');
      }

      const socket = createConnection({ host, port });
      socket.on('data', (chunk: Buffer) => {
        protocolBytes = Buffer.concat([protocolBytes, chunk]);
        if (protocolBytes.includes(Buffer.from('C25P03\0'))) {
          observedSqlStates.push('25P03');
        }
      });
      await once(socket, 'connect');
      return socket;
    },
  };

  return {
    sql: postgres(databaseUrl, options),
    observedSqlStates,
  };
}

function getPostgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { code?: string }).code;
}

async function expectSqlState(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    expect(getPostgresCode(error)).toBe(expectedCode);
    return;
  }

  throw new Error(`Expected PostgreSQL SQLSTATE ${expectedCode}`);
}

describe('application database session bounds', () => {
  const connections: ReturnType<typeof postgres>[] = [];

  beforeAll(async () => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const [readiness] = await sql<
        { migrationCount: number; tagCount: number }[]
      >`
        select
          (select count(*)::int from drizzle.__drizzle_migrations) as "migrationCount",
          (select count(*)::int from tags) as "tagCount"
      `;

      if (!readiness?.migrationCount || !readiness.tagCount) {
        throw new Error(
          'Database session proofs require a migrated and seeded local test target.',
        );
      }
    } finally {
      await sql.end({ timeout: 1 });
    }
  });

  afterAll(async () => {
    await Promise.all(
      connections.map(async (connection) => {
        try {
          await connection.end({ timeout: 1 });
        } catch {
          // A timeout proof may already have terminated the underlying session.
        }
      }),
    );
  });

  it('returns SQLSTATE 57014 for an over-budget statement', async () => {
    // Scale the production value down so the integration proof remains fast;
    // the unit contract separately pins the production 30-second value.
    const sql = createTestConnection({
      statement_timeout: TEST_STATEMENT_TIMEOUT,
    });
    connections.push(sql);

    await expectSqlState(
      () => sql`select pg_sleep(${TEST_LONG_OPERATION_SECONDS})`,
      '57014',
    );
  });

  it('returns SQLSTATE 55P03 when a lock wait exceeds its budget', async () => {
    const holder = createTestConnection({});
    const waiter = createTestConnection({
      lock_timeout: TEST_LOCK_TIMEOUT,
      statement_timeout: '1s',
    });
    connections.push(holder, waiter);

    await holder`select pg_advisory_lock(${LOCK_KEY})`;
    try {
      await expectSqlState(
        () => waiter`select pg_advisory_lock(${LOCK_KEY})`,
        '55P03',
      );
    } finally {
      await holder`select pg_advisory_unlock(${LOCK_KEY})`;
    }
  });

  it('observes SQLSTATE 25P03 for an idle transaction and recovers with a fresh pooled connection', async () => {
    const { sql, observedSqlStates } = createProtocolStateCaptureConnection({
      idle_in_transaction_session_timeout: TEST_IDLE_TRANSACTION_TIMEOUT,
    });
    connections.push(sql);

    await expectSqlState(
      () =>
        sql.begin(async (transaction) => {
          await transaction`select 1`;
          await new Promise((resolve) =>
            setTimeout(resolve, TEST_IDLE_WAIT_MS),
          );
          await transaction`select 1`;
        }),
      'CONNECTION_CLOSED',
    );
    expect(observedSqlStates).toContain('25P03');

    await expect(sql`select 1 as value`).resolves.toEqual([{ value: 1 }]);
  });
});
