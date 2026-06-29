import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BACKFILL_START = '-- DEBT-425 backfill:start';
const BACKFILL_END = '-- DEBT-425 backfill:end';

function extractMarkedBackfillBlocks(fileName: string, body: string): string[] {
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const startIndex = body.indexOf(BACKFILL_START, cursor);
    const nextEndIndex = body.indexOf(BACKFILL_END, cursor);

    if (startIndex === -1 && nextEndIndex === -1) break;
    if (
      startIndex === -1 ||
      (nextEndIndex !== -1 && nextEndIndex < startIndex)
    ) {
      throw new Error(
        `Malformed DEBT-425 marked backfill migration block in ${fileName}`,
      );
    }

    const endIndex = body.indexOf(
      BACKFILL_END,
      startIndex + BACKFILL_START.length,
    );
    if (endIndex === -1) {
      throw new Error(
        `Malformed DEBT-425 marked backfill migration block in ${fileName}`,
      );
    }

    blocks.push(
      body
        .slice(startIndex + BACKFILL_START.length, endIndex)
        .trim()
        .replaceAll('--> statement-breakpoint', ''),
    );
    cursor = endIndex + BACKFILL_END.length;
  }

  return blocks;
}

export function readDebt425BackfillSql(
  migrationsDir = join(process.cwd(), 'db/migrations'),
): string {
  const markedBlocks: string[] = [];

  for (const fileName of readdirSync(migrationsDir).sort()) {
    if (!fileName.endsWith('.sql')) continue;

    const body = readFileSync(join(migrationsDir, fileName), 'utf8');
    markedBlocks.push(...extractMarkedBackfillBlocks(fileName, body));
  }

  const [markedBlock] = markedBlocks;
  if (markedBlock === undefined) {
    throw new Error('Missing DEBT-425 marked backfill migration block');
  }
  if (markedBlocks.length !== 1) {
    throw new Error(
      `Expected exactly one DEBT-425 marked backfill migration block, found ${markedBlocks.length}`,
    );
  }

  return markedBlock;
}
