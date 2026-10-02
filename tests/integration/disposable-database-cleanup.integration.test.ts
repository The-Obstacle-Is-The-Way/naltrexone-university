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
