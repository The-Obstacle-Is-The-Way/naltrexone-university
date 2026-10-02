import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import { createDisposableDatabase } from './disposable-database-test-helpers';

it('drops a disposable database when its migration fails', async () => {
  const admin = postgres(process.env.DATABASE_URL ?? '', {
    max: 1,
    onnotice: () => {},
  });
  const folder = await mkdtemp(
    path.join(tmpdir(), 'content-audit-migrations-'),
  );
  let failedDatabase: string | undefined;
  try {
    await mkdir(path.join(folder, 'meta'));
    await writeFile(
      path.join(folder, 'meta/_journal.json'),
      JSON.stringify({
        entries: [
          { idx: 0, version: '7', when: 1, tag: '0000_bad', breakpoints: true },
        ],
      }),
    );
    await writeFile(
      path.join(folder, '0000_bad.sql'),
      "DO $$ BEGIN RAISE EXCEPTION 'injected migration failure' USING DETAIL = current_database(); END $$;",
    );
    const error = await createDisposableDatabase({
      migrationsFolder: folder,
    }).then(
      async (created) => {
        await created.drop();
        return undefined;
      },
      (failure: unknown) => failure,
    );
    // The real migration error identifies only this test's database. Never
    // infer ownership from a cluster-wide before/after inventory.
    let cause = error;
    while (cause instanceof Error) {
      if ('detail' in cause && typeof cause.detail === 'string') {
        failedDatabase = cause.detail;
        break;
      }
      cause = cause.cause;
    }
    expect(failedDatabase).toMatch(/^it_disposable_[0-9a-f]{32}$/);
    const remaining = await admin`
      SELECT datname FROM pg_database WHERE datname=${failedDatabase ?? ''}
    `;
    expect(remaining).toEqual([]);
  } finally {
    try {
      if (
        failedDatabase &&
        /^it_disposable_[0-9a-f]{32}$/.test(failedDatabase)
      ) {
        await admin.unsafe(
          `DROP DATABASE IF EXISTS "${failedDatabase}" WITH (FORCE)`,
        );
      }
    } finally {
      await admin.end({ timeout: 5 });
      await rm(folder, { recursive: true, force: true });
    }
  }
});

it('preserves the migration error when database cleanup also fails', async () => {
  const originalUrl = process.env.DATABASE_URL;
  if (!originalUrl) throw new Error('DATABASE_URL is required');
  const admin = postgres(originalUrl, { max: 1, onnotice: () => {} });
  const role = `it_cleanup_${randomUUID().replaceAll('-', '')}`;
  const password = randomUUID();
  const folder = await mkdtemp(path.join(tmpdir(), 'content-audit-cleanup-'));
  let databaseName: string | undefined;
  let attempted: Promise<unknown> | undefined;
  try {
    await admin.unsafe(
      `CREATE ROLE "${role}" LOGIN CREATEDB PASSWORD '${password}'`,
    );
    await mkdir(path.join(folder, 'meta'));
    await writeFile(
      path.join(folder, 'meta/_journal.json'),
      JSON.stringify({
        entries: [
          { idx: 0, version: '7', when: 1, tag: '0000_bad', breakpoints: true },
        ],
      }),
    );
    // Wait on a real catalog condition, not elapsed time. The administrator
    // transfers ownership below, so the creator can no longer DROP the DB.
    await writeFile(
      path.join(folder, '0000_bad.sql'),
      `
      SET LOCAL statement_timeout = '3s';
      DO $$ BEGIN
        WHILE (SELECT pg_get_userbyid(datdba) = current_user FROM pg_database WHERE datname = current_database()) LOOP
          PERFORM pg_sleep(0.01);
        END LOOP;
        RAISE EXCEPTION 'injected migration failure' USING DETAIL = current_database();
      END $$;
    `,
    );
    const limitedUrl = new URL(originalUrl);
    limitedUrl.username = role;
    limitedUrl.password = password;
    process.env.DATABASE_URL = limitedUrl.toString();
    attempted = createDisposableDatabase({ migrationsFolder: folder }).catch(
      (error: unknown) => error,
    );
    await expect
      .poll(async () => {
        const rows = await admin<{ datname: string }[]>`
        SELECT datname FROM pg_database WHERE pg_get_userbyid(datdba) = ${role}
      `;
        databaseName = rows[0]?.datname;
        return rows.length;
      })
      .toBe(1);
    if (!databaseName || !/^it_disposable_[0-9a-f]{32}$/.test(databaseName)) {
      throw new Error('Unexpected disposable database name');
    }
    await admin.unsafe(
      `ALTER DATABASE "${databaseName}" OWNER TO CURRENT_USER`,
    );
    const error = await attempted;
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw error;
    expect(error.message).toBe('Disposable migration and cleanup failed');
    expect(error.errors).toHaveLength(2);
    expect(error.cause).toBe(error.errors[0]);
    expect(error.errors[0].cause).toMatchObject({
      message: 'injected migration failure',
    });
    expect(error.errors[1]).toMatchObject({ code: '42501' });
  } finally {
    process.env.DATABASE_URL = originalUrl;
    try {
      // The migration's statement timeout also bounds this wait if the
      // administrator failed before transferring ownership.
      await attempted;
      const remaining = await admin<{ datname: string }[]>`
        SELECT datname FROM pg_database
        WHERE pg_get_userbyid(datdba) = ${role} OR datname = ${databaseName ?? ''}
      `;
      for (const row of remaining) {
        if (/^it_disposable_[0-9a-f]{32}$/.test(row.datname)) {
          await admin.unsafe(`DROP DATABASE "${row.datname}" WITH (FORCE)`);
        }
      }
      await admin.unsafe(`DROP ROLE IF EXISTS "${role}"`);
    } finally {
      await admin.end({ timeout: 5 });
      await rm(folder, { recursive: true, force: true });
    }
  }
});
