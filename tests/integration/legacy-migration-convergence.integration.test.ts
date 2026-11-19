import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import journal from '@/db/migrations/meta/_journal.json';
import { KNOWN_LEGACY_MIGRATION_HASH_DRIFTS } from '@/scripts/database/migration-ledger';
import { createDisposableDatabase } from './disposable-database-test-helpers';

// Compare logical columns by name. PostgreSQL appends ADD COLUMN repairs at
// the end, so physical column positions legitimately differ between paths.
async function catalog(url: string) {
  const sql = postgres(url, { max: 1 });
  try {
    return await sql`
      SELECT c.relname AS relation, 'column' AS kind, a.attname AS name,
             concat_ws('|', format_type(a.atttypid, a.atttypmod), a.attnotnull,
                       a.attidentity, a.attgenerated, pg_get_expr(d.adbin, d.adrelid)) AS definition
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      LEFT JOIN pg_attrdef d ON (d.adrelid, d.adnum) = (c.oid, a.attnum)
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
        AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT c.relname, 'constraint', con.conname,
             concat_ws('|', pg_get_constraintdef(con.oid), con.convalidated)
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      WHERE c.relnamespace = 'public'::regnamespace
      UNION ALL
      SELECT t.relname, 'index', c.relname,
             concat_ws('|', pg_get_indexdef(c.oid), i.indisvalid, i.indisready)
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      WHERE t.relnamespace = 'public'::regnamespace
      UNION ALL
      SELECT t.typname, 'enum', t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname
      ORDER BY 1, 2, 3
    `;
  } finally {
    await sql.end();
  }
}

it.each(KNOWN_LEGACY_MIGRATION_HASH_DRIFTS)(
  'converges from the exact $tag draft by $repairMigrationTag',
  async (drift) => {
    const folder = mkdtempSync(join(tmpdir(), 'legacy-migrations-'));
    const databases: Awaited<ReturnType<typeof createDisposableDatabase>>[] =
      [];
    try {
      cpSync('db/migrations', folder, { recursive: true });
      const repair = journal.entries.find(
        (entry) => entry.tag === drift.repairMigrationTag,
      );
      const original = journal.entries.find((entry) => entry.tag === drift.tag);
      expect(original?.when).toBe(drift.when);
      expect(repair?.idx).toBeGreaterThan(original?.idx ?? Infinity);
      const canonicalSql = readFileSync(join(folder, drift.tag + '.sql'));
      expect(createHash('sha256').update(canonicalSql).digest('hex')).toBe(
        drift.expectedHash,
      );
      if (!repair)
        throw new Error(`Missing repair migration ${drift.repairMigrationTag}`);
      writeFileSync(
        join(folder, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.filter((entry) => entry.idx <= repair.idx),
        }),
      );
      const canonical = await createDisposableDatabase({
        migrationsFolder: folder,
      });
      databases.push(canonical);
      const draft = readFileSync(
        join('tests/fixtures/legacy-migrations', drift.tag + '.sql'),
      );
      expect(createHash('sha256').update(draft).digest('hex')).toBe(
        drift.appliedHash,
      );
      writeFileSync(join(folder, drift.tag + '.sql'), draft);
      const legacy = await createDisposableDatabase({
        migrationsFolder: folder,
      });
      databases.push(legacy);
      expect(await catalog(legacy.url)).toEqual(await catalog(canonical.url));
    } finally {
      try {
        await Promise.all(databases.map((database) => database.drop()));
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }
  },
);
