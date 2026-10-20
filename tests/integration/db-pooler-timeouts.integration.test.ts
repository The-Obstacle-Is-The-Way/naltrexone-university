import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createConnection, createServer, type Socket } from 'node:net';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import migrationJournal from '@/db/migrations/meta/_journal.json';
import { POSTGRES_CONNECTION_PARAMETERS } from '@/lib/db-connection-options';
import { resolveLocalTestTarget } from '@/scripts/test-lanes/resolve-local-test-target';
import { resolveIntegrationDatabaseUrl } from '@/tests/shared/resolve-integration-database-url';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

const execFileAsync = promisify(execFile);
const adminUrl = resolveIntegrationDatabaseUrl();
const poolerPort = resolveLocalTestTarget().poolerPort;
const suffix = randomUUID().replaceAll('-', '');
const role = `bounds_${suffix}`;
const database = `bounds_${suffix}`;
const admin = postgres(adminUrl, { max: 1 });

function connectionUrl(pooled: boolean, user = role): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  if (user === role) {
    url.username = role;
    url.password = 'local-pooler-test';
  }
  if (pooled) url.port = poolerPort;
  return url.toString();
}

async function runMigrationClient(
  databaseUrl = connectionUrl(true),
  args = [
    '--import',
    'tsx',
    'scripts/database/managed/run-managed-db-migrate.ts',
  ],
): Promise<void> {
  try {
    await execFileAsync(process.execPath, args, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 8_000,
    });
  } catch (error) {
    // Child diagnostics must not expose a connection URL, even on failure.
    const diagnostics =
      error && typeof error === 'object' && 'stderr' in error
        ? `${'stdout' in error ? String(error.stdout) : ''}\n${String(error.stderr)}`.replace(
            /postgres(?:ql)?:\/\/\S+/g,
            '[database URL]',
          )
        : 'No child diagnostics';
    throw new Error(
      `Migration process failed (exit code ${error && typeof error === 'object' && 'code' in error ? error.code : 'unknown'}): ${diagnostics}`,
    );
  }
}

async function refreshPool(): Promise<void> {
  const url = new URL(adminUrl);
  url.port = poolerPort;
  url.pathname = '/pgbouncer';
  const poolAdmin = postgres(url.toString(), {
    max: 1,
    prepare: false,
    fetch_types: false,
  });
  try {
    await poolAdmin.unsafe(`RECONNECT ${database}`);
    await poolAdmin.unsafe(`WAIT_CLOSE ${database}`);
  } finally {
    await poolAdmin.end();
  }
}

async function readBounds(sql: postgres.Sql | postgres.TransactionSql) {
  const [statement] = await sql`show statement_timeout`;
  const [lock] = await sql`show lock_timeout`;
  const [idle] = await sql`show idle_in_transaction_session_timeout`;
  return {
    statement_timeout: statement?.statement_timeout,
    lock_timeout: lock?.lock_timeout,
    idle_in_transaction_session_timeout:
      idle?.idle_in_transaction_session_timeout,
  };
}

function applicationConnection() {
  // The same startup parameters lib/db.ts passes to postgres.js. The pooler
  // ignores these three parameters; their presence must not make this pass.
  return postgres(connectionUrl(true), {
    max: 1,
    connection: POSTGRES_CONNECTION_PARAMETERS,
  });
}

const expectedBounds = {
  statement_timeout: '30s',
  lock_timeout: '5s',
  idle_in_transaction_session_timeout: '1min',
};
const shortTimeout = '100ms';
const longOperationSeconds = 1;
const idleWaitMs = 250;
const lockKey = 345;
const migrationSql = readFileSync(
  'db/migrations/0052_bug345_role_timeouts.sql',
  'utf8',
);

async function withShortRoleBounds(
  overrides: Record<string, string>,
  check: () => Promise<void>,
) {
  const roleSql = postgres(connectionUrl(false), { max: 1 });
  try {
    for (const [name, value] of Object.entries(overrides)) {
      const [command] = await roleSql<{ command: string }[]>`
        select format('ALTER ROLE CURRENT_USER IN DATABASE %I SET %I = %L', current_database(), ${name}::text, ${value}::text) as command
      `;
      if (!command) throw new Error('Missing role-default command');
      await roleSql.unsafe(command.command);
    }
    await refreshPool();
    await check();
  } finally {
    // Only this suite's disposable role/database is changed. Restore the
    // actual migration before the next case, and prove new backend logins.
    await roleSql.unsafe(migrationSql);
    await roleSql.end();
    await refreshPool();
  }
}

describe('application bounds through a transaction pooler', () => {
  let staleBounds: Awaited<ReturnType<typeof readBounds>>;

  beforeAll(async () => {
    await admin.unsafe(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'local-pooler-test'`,
    );
    await admin`create database ${admin(database)} owner ${admin(role)}`;
    const oldBackend = applicationConnection();
    try {
      await oldBackend.begin(async (tx) => {
        await tx`select 1`;
        await runMigrationClient();
        staleBounds = await readBounds(tx);
      });
    } finally {
      await oldBackend.end();
    }
    await refreshPool();
  });

  afterAll(async () => {
    try {
      await admin`drop database if exists ${admin(database)} with (force)`;
      await admin`drop role if exists ${admin(role)}`;
    } finally {
      await admin.end();
    }
  });

  it('gets the application bounds from the migrated ordinary role through the pooler', async () => {
    const sql = postgres(connectionUrl(true), {
      max: 1,
      connection: POSTGRES_CONNECTION_PARAMETERS,
    });
    try {
      const [privileges] =
        await sql`select rolsuper, rolcreaterole, rolcreatedb from pg_roles where rolname = current_user`;
      expect(privileges).toEqual({
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
      });
      expect(await sql.begin('read only', readBounds)).toEqual(expectedBounds);
      const [defaults] = await sql<{ setconfig: string[] }[]>`
        select setconfig from pg_db_role_setting
        where setrole = current_user::regrole
          and setdatabase = (select oid from pg_database where datname = current_database())
      `;
      expect(defaults?.setconfig.toSorted()).toEqual(
        Object.entries(POSTGRES_CONNECTION_PARAMETERS)
          .filter(([name]) => name.endsWith('_timeout'))
          .map(([name, value]) => `${name}=${value}`)
          .toSorted(),
      );
    } finally {
      await sql.end();
    }
  });

  it('keeps old backends unchanged and applies defaults to concurrent new backends without client options', async () => {
    expect(staleBounds).toEqual({
      statement_timeout: '0',
      lock_timeout: '0',
      idle_in_transaction_session_timeout: '0',
    });
    const clients = Array.from({ length: 3 }, () =>
      postgres(connectionUrl(true), { max: 1 }),
    );
    const release = createDeferred<void>();
    let ready = 0;
    try {
      const observations = await Promise.all(
        clients.map((sql) =>
          sql.begin('read only', async (tx) => {
            const bounds = await readBounds(tx);
            const [backend] = await tx`select pg_backend_pid() as pid`;
            if (++ready === clients.length) release.resolve();
            await release.promise;
            return { bounds, pid: backend?.pid };
          }),
        ),
      );
      expect(new Set(observations.map(({ pid }) => pid)).size).toBe(
        clients.length,
      );
      for (const { bounds } of observations)
        expect(bounds).toEqual(expectedBounds);
    } finally {
      release.resolve();
      await Promise.all(clients.map((sql) => sql.end({ timeout: 1 })));
    }
  });

  it('returns 57014 for a standalone statement through the pooler', async () => {
    await withShortRoleBounds({ statement_timeout: shortTimeout }, async () => {
      const sql = applicationConnection();
      try {
        await expect(
          sql`select pg_sleep(${longOperationSeconds})`,
        ).rejects.toMatchObject({ code: '57014' });
      } finally {
        await sql.end();
      }
    });
  });

  it('returns 55P03 for a transaction lock wait through the pooler', async () => {
    await withShortRoleBounds({ lock_timeout: shortTimeout }, async () => {
      const holder = postgres(connectionUrl(false, 'postgres'), { max: 1 });
      const waiter = applicationConnection();
      try {
        await holder.begin(async (tx) => {
          await tx`select pg_advisory_xact_lock(${lockKey})`;
          await expect(
            waiter.begin(async (waiterTx) => {
              await waiterTx`select pg_advisory_xact_lock(${lockKey})`;
            }),
          ).rejects.toMatchObject({ code: '55P03' });
        });
      } finally {
        await Promise.all([holder.end(), waiter.end()]);
      }
    });
  });

  it('observes 25P03 through the pooler and recovers after an idle transaction is terminated', async () => {
    await withShortRoleBounds(
      { idle_in_transaction_session_timeout: shortTimeout },
      async () => {
        let protocolBytes = Buffer.alloc(0);
        const options = {
          max: 1,
          connection: POSTGRES_CONNECTION_PARAMETERS,
          socket: async ({
            host: [host],
            port: [port],
          }: {
            host: string[];
            port: number[];
          }) => {
            if (!host || !port) throw new Error('Missing local pooler address');
            const socket = createConnection({ host, port });
            socket.on('data', (chunk: Buffer) => {
              protocolBytes = Buffer.concat([protocolBytes, chunk]);
            });
            await once(socket, 'connect');
            return socket;
          },
        };
        const sql = postgres(connectionUrl(true), options);
        try {
          await expect(
            sql.begin(async (tx) => {
              await tx`select 1`;
              await new Promise((resolve) => setTimeout(resolve, idleWaitMs));
              await tx`select 1`;
            }),
          ).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
          expect(protocolBytes.includes(Buffer.from('C25P03\0'))).toBe(true);
          await expect(sql`select 1 as value`).resolves.toEqual([{ value: 1 }]);
        } finally {
          await sql.end({ timeout: 1 });
        }
      },
    );
  });

  it('retains the server default after an override is rolled back to a savepoint', async () => {
    await withShortRoleBounds({ statement_timeout: shortTimeout }, async () => {
      const sql = applicationConnection();
      const rollback = new Error('Roll back the temporary override');
      try {
        await expect(
          sql.begin(async (tx) => {
            await expect(
              tx.savepoint(async (nested) => {
                await nested`set local statement_timeout = '2s'`;
                throw rollback;
              }),
            ).rejects.toBe(rollback);
            await tx`select pg_sleep(${longOperationSeconds})`;
          }),
        ).rejects.toMatchObject({ code: '57014' });
      } finally {
        await sql.end();
      }
    });
  });

  it('records all three bounds inside the actual managed Drizzle migration transaction', async () => {
    const sql = postgres(connectionUrl(false), { max: 1 });
    try {
      await sql`create table migration_bounds_receipt (role_name text, statement_bound text, lock_bound text, idle_bound text)`;
      await sql.unsafe(`create function capture_migration_bounds() returns trigger language plpgsql as $$
        begin
          insert into migration_bounds_receipt values (current_user, current_setting('statement_timeout'), current_setting('lock_timeout'), current_setting('idle_in_transaction_session_timeout'));
          return new;
        end $$`);
      await sql`create trigger capture_migration_bounds before insert on drizzle.__drizzle_migrations for each row execute function capture_migration_bounds()`;
      const entry = migrationJournal.entries.find(
        ({ tag }) => tag === '0052_bug345_role_timeouts',
      );
      if (!entry) throw new Error('Timeout migration must be in the journal');
      // Rerun only the idempotent role-default migration in this disposable DB.
      await sql`delete from drizzle.__drizzle_migrations where created_at = ${entry.when}`;
      await runMigrationClient();
      expect(await sql`select * from migration_bounds_receipt`).toEqual([
        {
          role_name: role,
          statement_bound: '30s',
          lock_bound: '5s',
          idle_bound: '1min',
        },
      ]);
    } finally {
      await sql.end();
    }
  });

  it.each([
    {
      name: 'installed Drizzle migrator',
      args: ['node_modules/drizzle-kit/bin.cjs', 'migrate'],
      message: 'exit code 1',
    },
    {
      name: 'managed ledger precheck',
      args: [
        '--import',
        'tsx',
        'scripts/database/managed/run-managed-db-migrate.ts',
      ],
      message: 'Managed migration stopped at ledger precheck.',
    },
  ])(
    'fails the $name at its five-second lock bound',
    async ({ args, message }) => {
      const holder = postgres(connectionUrl(false), { max: 1 });
      // Drizzle Kit's CLI can discard the server error from its terminal output.
      // A transparent local TCP relay records the actual server SQLSTATE while
      // running the installed migration client directly. A managed precheck would
      // wait on this lock first and would no longer prove Drizzle's own bound.
      let protocolBytes = Buffer.alloc(0);
      const sockets: Socket[] = [];
      const relay = createServer((client) => {
        const server = createConnection({
          host: '127.0.0.1',
          port: Number(poolerPort),
        });
        sockets.push(client, server);
        server.on('data', (chunk: Buffer) => {
          protocolBytes = Buffer.concat([protocolBytes, chunk]);
        });
        client.on('error', () => server.destroy());
        server.on('error', () => client.destroy());
        client.pipe(server).pipe(client);
      });
      relay.listen(0, '127.0.0.1');
      await once(relay, 'listening');
      const address = relay.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing relay port');
      const url = new URL(connectionUrl(true));
      url.port = String(address.port);
      try {
        await holder.begin(async (tx) => {
          await tx`lock table drizzle.__drizzle_migrations in access exclusive mode`;
          await expect(
            runMigrationClient(url.toString(), args),
          ).rejects.toThrow(message);
          expect(protocolBytes.includes(Buffer.from('C55P03\0'))).toBe(true);
        });
      } finally {
        await holder.end();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) =>
          relay.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );
});
