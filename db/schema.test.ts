import { describe, expect, it } from 'vitest';
import { practiceSessions } from './schema';

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
  it('defines a user + endedAt index for incomplete/completed session filters', () => {
    const indexes = getPracticeSessionIndexes();

    expect(indexes.userEndedAtIdx.config.name).toBe(
      'practice_sessions_user_ended_at_idx',
    );
  });
});
