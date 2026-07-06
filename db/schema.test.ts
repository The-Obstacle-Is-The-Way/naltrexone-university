import { describe, expect, expectTypeOf, it } from 'vitest';
import { DAY_MS } from '@/src/domain/services/time-constants';
import type {
  NewPendingStripeCancellation,
  PendingStripeCancellation,
  pendingStripeCancellations,
} from './schema';
import {
  PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
  practiceSessionQuestionStates,
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

function getPracticeSessionIndex(name: string): { config: { name: string } } {
  const index = getPracticeSessionIndexes()[name];
  if (index === undefined) {
    throw new Error(`Missing practiceSessions index: ${name}`);
  }
  return index;
}

function getPracticeSessionQuestionStateConfig(): Record<string, unknown> {
  const extraConfigBuilderSymbol = getTableSymbol(
    practiceSessionQuestionStates,
    'Symbol(drizzle:ExtraConfigBuilder)',
  );
  const extraConfigColumnsSymbol = getTableSymbol(
    practiceSessionQuestionStates,
    'Symbol(drizzle:ExtraConfigColumns)',
  );

  const tableAsSymbolRecord =
    practiceSessionQuestionStates as unknown as Record<symbol, unknown>;
  const extraConfigBuilder = tableAsSymbolRecord[extraConfigBuilderSymbol];
  const extraConfigColumns = tableAsSymbolRecord[extraConfigColumnsSymbol];

  if (typeof extraConfigBuilder !== 'function') {
    throw new Error('Expected Drizzle extra config builder function');
  }

  return (extraConfigBuilder as (columns: unknown) => Record<string, unknown>)(
    extraConfigColumns,
  );
}

function getSqlQueryChunks(value: unknown): unknown[] {
  const checkValue = (value as { value?: { queryChunks?: unknown[] } }).value;
  if (!Array.isArray(checkValue?.queryChunks)) {
    throw new Error('Expected Drizzle check SQL query chunks');
  }
  return checkValue.queryChunks;
}

function collectSqlChunkText(chunks: readonly unknown[]): string {
  return chunks
    .flatMap((chunk) => {
      const value = (chunk as { value?: unknown }).value;
      const ownText = Array.isArray(value)
        ? value.filter((part): part is string => typeof part === 'string')
        : [];
      const nestedChunks = (chunk as { queryChunks?: unknown[] }).queryChunks;
      const nestedText = Array.isArray(nestedChunks)
        ? [collectSqlChunkText(nestedChunks)]
        : [];
      return [...ownText, ...nestedText];
    })
    .join('');
}

describe('practiceSessions schema indexes', () => {
  it('defines a user + startedAt index for session ordering', () => {
    expect(getPracticeSessionIndex('userStartedAtIdx').config.name).toBe(
      'practice_sessions_user_started_at_idx',
    );
  });

  it('defines a user + endedAt index for incomplete/completed session filters', () => {
    expect(getPracticeSessionIndex('userEndedAtIdx').config.name).toBe(
      'practice_sessions_user_ended_at_idx',
    );
  });

  it('defines a partial unique index enforcing one incomplete session per user', () => {
    expect(getPracticeSessionIndex('userIncompleteUq').config.name).toBe(
      PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
    );
  });
});

describe('practiceSessionQuestionStates schema checks', () => {
  it('uses the domain day bound for draft cumulative milliseconds', () => {
    const draftCumulativeMsCheck =
      getPracticeSessionQuestionStateConfig().draftCumulativeMsChk;
    const queryChunks = getSqlQueryChunks(draftCumulativeMsCheck);
    const sqlText = collectSqlChunkText(queryChunks);

    expect(sqlText).toContain(String(DAY_MS));
    expect(queryChunks.some((chunk) => chunk === DAY_MS)).toBe(false);
  });
});

describe('db schema exports', () => {
  it('returns PendingStripeCancellation when inferring select type from pendingStripeCancellations', () => {
    expectTypeOf<PendingStripeCancellation>().toEqualTypeOf<
      typeof pendingStripeCancellations.$inferSelect
    >();
  });

  it('returns NewPendingStripeCancellation when inferring insert type from pendingStripeCancellations', () => {
    expectTypeOf<NewPendingStripeCancellation>().toEqualTypeOf<
      typeof pendingStripeCancellations.$inferInsert
    >();
  });
});
