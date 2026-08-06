import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CANCELLATION_METHOD =
  'Billing page in the app or support@addictionboards.com';

function renewalConsentMigrationSql(): string {
  return readdirSync(path.join(process.cwd(), 'db/migrations'))
    .filter((fileName) => /^003[3-9].*\.sql$/.test(fileName))
    .sort()
    .map((fileName) =>
      readFileSync(path.join(process.cwd(), 'db/migrations', fileName), 'utf8'),
    )
    .join('\n');
}

describe('renewal consent migration', () => {
  it('backfills existing trial setup operations before requiring cancellation_method', () => {
    const sql = renewalConsentMigrationSql();
    const safeAdd = `ADD COLUMN "cancellation_method" text DEFAULT '${CANCELLATION_METHOD}' NOT NULL`;
    const removeDefault = 'ALTER COLUMN "cancellation_method" DROP DEFAULT';

    expect(sql).toContain(safeAdd);
    expect(sql.indexOf(removeDefault)).toBeGreaterThan(sql.indexOf(safeAdd));
    expect(sql).not.toContain(
      'ADD COLUMN "cancellation_method" text NOT NULL;',
    );
  });
});
