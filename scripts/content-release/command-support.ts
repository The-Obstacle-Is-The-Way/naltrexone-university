import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import type { ActivationSummary } from './release-activation';

type Db = PostgresJsDatabase<typeof schema>;

export async function withCommandDatabase<T>(
  databaseUrl: string,
  act: (db: Db) => Promise<T>,
): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await act(drizzle(sql, { schema }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// A dry run is the real transaction, rolled back: it verifies, locks and
// counts exactly as the applied run would, then leaves nothing behind.
export async function previewOrApply<T>(
  db: Db,
  apply: boolean,
  act: (db: Db) => Promise<T>,
): Promise<T> {
  if (apply) return act(db);
  class Preview extends Error {
    constructor(readonly value: T) {
      super('Dry run rolled back');
    }
  }
  try {
    return await db.transaction(async (tx) => {
      throw new Preview(await act(tx));
    });
  } catch (error) {
    if (error instanceof Preview) return error.value;
    throw error;
  }
}

export function formatActivation(summary: ActivationSummary): string {
  return [
    `release=${summary.releaseId}`,
    `previous=${summary.previousReleaseId ?? 'none'}`,
    `items=${summary.items}`,
    `published=${summary.published}`,
    `archived=${summary.archived}`,
    `excludedWithdrawn=${summary.excludedWithdrawn}`,
    `excludedHeld=${summary.excludedHeld}`,
  ].join(' ');
}

// For commands whose only argument is --apply.
export function parseApplyFlag(argv: readonly string[]): {
  apply: boolean;
} {
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply' && !apply) {
      apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { apply };
}
