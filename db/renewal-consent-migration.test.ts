import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CANCELLATION_METHOD =
  'Billing page in the app or support@addictionboards.com';

function renewalConsentMigrationSql(): {
  addColumnSql: string;
  removeDefaultSql: string;
} {
  const migrationsDirectory = path.join(process.cwd(), 'db/migrations');

  return {
    addColumnSql: readFileSync(
      path.join(migrationsDirectory, '0033_small_wrecker.sql'),
      'utf8',
    ),
    removeDefaultSql: readFileSync(
      path.join(
        migrationsDirectory,
        '0034_remove_setup_cancellation_default.sql',
      ),
      'utf8',
    ),
  };
}

describe('renewal consent migration', () => {
  it('backfills existing trial setup operations before requiring cancellation_method', () => {
    const { addColumnSql, removeDefaultSql } = renewalConsentMigrationSql();
    const safeAdd = `ADD COLUMN "cancellation_method" text DEFAULT '${CANCELLATION_METHOD}' NOT NULL`;
    const removeDefault = 'ALTER COLUMN "cancellation_method" DROP DEFAULT';

    expect(addColumnSql).toContain(safeAdd);
    expect(removeDefaultSql).toContain(removeDefault);
    expect(addColumnSql).not.toContain(
      'ADD COLUMN "cancellation_method" text NOT NULL;',
    );
  });
});
