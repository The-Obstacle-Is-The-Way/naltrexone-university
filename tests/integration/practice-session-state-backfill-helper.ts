import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BACKFILL_START = '-- DEBT-425 backfill:start';
const BACKFILL_END = '-- DEBT-425 backfill:end';

export function readDebt425BackfillSql(
  migrationsDir = join(process.cwd(), 'db/migrations'),
): string {
  for (const fileName of readdirSync(migrationsDir).sort()) {
    if (!fileName.endsWith('.sql')) continue;

    const body = readFileSync(join(migrationsDir, fileName), 'utf8');
    const startIndex = body.indexOf(BACKFILL_START);
    const endIndex = body.indexOf(BACKFILL_END);
    if (startIndex === -1 || endIndex === -1) continue;

    return body
      .slice(startIndex + BACKFILL_START.length, endIndex)
      .trim()
      .replaceAll('--> statement-breakpoint', '');
  }

  throw new Error('Missing DEBT-425 marked backfill migration block');
}
