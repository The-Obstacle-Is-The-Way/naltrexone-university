import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BACKFILL_START = '-- DEBT-425 backfill:start';
const BACKFILL_END = '-- DEBT-425 backfill:end';
const CLEANUP_START = '-- DEBT-428/434 cleanup:start';
const CLEANUP_END = '-- DEBT-428/434 cleanup:end';
const WITHDRAWAL_BACKFILL_START = '-- DEBT-483 withdrawal backfill:start';
const WITHDRAWAL_BACKFILL_END = '-- DEBT-483 withdrawal backfill:end';
const WITHDRAWAL_REPAIR_START = '-- DEBT-483 withdrawal backfill repair:start';
const WITHDRAWAL_REPAIR_END = '-- DEBT-483 withdrawal backfill repair:end';

function extractMarkedBlocks(
  fileName: string,
  body: string,
  startMarker: string,
  endMarker: string,
  markerDescription: string,
): string[] {
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const startIndex = body.indexOf(startMarker, cursor);
    const nextEndIndex = body.indexOf(endMarker, cursor);

    if (startIndex === -1 && nextEndIndex === -1) break;
    if (
      startIndex === -1 ||
      (nextEndIndex !== -1 && nextEndIndex < startIndex)
    ) {
      throw new Error(
        `Malformed ${markerDescription} migration block in ${fileName}`,
      );
    }

    const endIndex = body.indexOf(endMarker, startIndex + startMarker.length);
    if (endIndex === -1) {
      throw new Error(
        `Malformed ${markerDescription} migration block in ${fileName}`,
      );
    }

    blocks.push(
      body
        .slice(startIndex + startMarker.length, endIndex)
        .trim()
        .replaceAll('--> statement-breakpoint', ''),
    );
    cursor = endIndex + endMarker.length;
  }

  return blocks;
}

function readSingleMarkedMigrationSql(input: {
  migrationsDir: string;
  startMarker: string;
  endMarker: string;
  markerDescription: string;
}): string {
  const markedBlocks: string[] = [];

  for (const fileName of readdirSync(input.migrationsDir).sort()) {
    if (!fileName.endsWith('.sql')) continue;

    const body = readFileSync(join(input.migrationsDir, fileName), 'utf8');
    markedBlocks.push(
      ...extractMarkedBlocks(
        fileName,
        body,
        input.startMarker,
        input.endMarker,
        input.markerDescription,
      ),
    );
  }

  const [markedBlock] = markedBlocks;
  if (markedBlock === undefined) {
    throw new Error(`Missing ${input.markerDescription} migration block`);
  }
  if (markedBlocks.length !== 1) {
    throw new Error(
      `Expected exactly one ${input.markerDescription} migration block, found ${markedBlocks.length}`,
    );
  }

  return markedBlock;
}

export function readDebt425BackfillSql(
  migrationsDir = join(process.cwd(), 'db/migrations'),
): string {
  return readSingleMarkedMigrationSql({
    migrationsDir,
    startMarker: BACKFILL_START,
    endMarker: BACKFILL_END,
    markerDescription: 'DEBT-425 marked backfill',
  });
}

export function readDebt428434CleanupSql(
  migrationsDir = join(process.cwd(), 'db/migrations'),
): string {
  return readSingleMarkedMigrationSql({
    migrationsDir,
    startMarker: CLEANUP_START,
    endMarker: CLEANUP_END,
    markerDescription: 'DEBT-428/434 marked cleanup',
  });
}

export function readDebt483WithdrawalBackfillSql(
  migrationsDir = join(process.cwd(), 'db/migrations'),
): string {
  return readSingleMarkedMigrationSql({
    migrationsDir,
    startMarker: WITHDRAWAL_BACKFILL_START,
    endMarker: WITHDRAWAL_BACKFILL_END,
    markerDescription: 'DEBT-483 marked withdrawal backfill',
  });
}

export function readDebt483WithdrawalBackfillRepairSql(
  migrationsDir = join(process.cwd(), 'db/migrations'),
): string {
  return readSingleMarkedMigrationSql({
    migrationsDir,
    startMarker: WITHDRAWAL_REPAIR_START,
    endMarker: WITHDRAWAL_REPAIR_END,
    markerDescription: 'DEBT-483 marked withdrawal backfill repair',
  });
}
