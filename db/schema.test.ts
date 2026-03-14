import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  NewPendingStripeCancellation,
  PendingStripeCancellation,
  pendingStripeCancellations,
} from './schema';
import {
  PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
  practiceSessions,
} from './schema';

// Drizzle stores extra config (indexes, constraints) behind internal Symbols.
// This coupling is intentional: these helpers let us regression-test that
// required indexes exist without spinning up a real database. If Drizzle
// renames these symbols in a future version, the helpers will throw at test
// time, signalling a needed update.
type DrizzleTableSymbolName =
  | 'Symbol(drizzle:ExtraConfigBuilder)'
  | 'Symbol(drizzle:ExtraConfigColumns)';

function getTableSymbol(
  table: object,
  symbolName: DrizzleTableSymbolName,
): symbol {
  const symbol = Object.getOwnPropertySymbols(table).find(
    (s) => s.toString() === symbolName,
  );
  if (!symbol) {
    throw new Error(`Missing ${symbolName} on Drizzle table`);
  }
  return symbol;
}

function getPracticeSessionIndexes(): Record<
  string,
  { config: { name: string } }
> {
  const extraConfigBuilderSymbol = getTableSymbol(
    practiceSessions,
    'Symbol(drizzle:ExtraConfigBuilder)',
  );
  const extraConfigColumnsSymbol = getTableSymbol(
    practiceSessions,
    'Symbol(drizzle:ExtraConfigColumns)',
  );

  const practiceSessionsAsSymbolRecord = practiceSessions as unknown as Record<
    symbol,
    unknown
  >;
  const extraConfigBuilder =
    practiceSessionsAsSymbolRecord[extraConfigBuilderSymbol];
  const extraConfigColumns =
    practiceSessionsAsSymbolRecord[extraConfigColumnsSymbol];

  if (typeof extraConfigBuilder !== 'function') {
    throw new Error('Expected Drizzle extra config builder function');
  }

  return (
    extraConfigBuilder as (
      columns: unknown,
    ) => Record<string, { config: { name: string } }>
  )(extraConfigColumns);
}

describe('practiceSessions schema indexes', () => {
  it('defines a user + startedAt index for session ordering', () => {
    const indexes = getPracticeSessionIndexes();

    expect(indexes.userStartedAtIdx.config.name).toBe(
      'practice_sessions_user_started_at_idx',
    );
  });

  it('defines a user + endedAt index for incomplete/completed session filters', () => {
    const indexes = getPracticeSessionIndexes();

    expect(indexes.userEndedAtIdx.config.name).toBe(
      'practice_sessions_user_ended_at_idx',
    );
  });

  it('defines a partial unique index enforcing one incomplete session per user', () => {
    const indexes = getPracticeSessionIndexes();

    expect(indexes.userIncompleteUq.config.name).toBe(
      PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
    );
  });
});

describe('db schema exports', () => {
  it('exports select and insert aliases for pendingStripeCancellations', () => {
    expectTypeOf<PendingStripeCancellation>().toEqualTypeOf<
      typeof pendingStripeCancellations.$inferSelect
    >();
    expectTypeOf<NewPendingStripeCancellation>().toEqualTypeOf<
      typeof pendingStripeCancellations.$inferInsert
    >();
  });
});
