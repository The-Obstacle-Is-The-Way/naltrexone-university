import { getTableColumns } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { DAY_MS } from '@/src/domain/services/time-constants';
import type {
  NewPendingStripeCancellation,
  PendingStripeCancellation,
  pendingStripeCancellations,
} from './schema';
import {
  ATTEMPTS_SELECTED_CHOICE_QUESTION_IDX,
  attempts,
  PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
  practiceSessionQuestionStates,
  practiceSessions,
  stripeSubscriptions,
} from './schema';

// Drizzle's public table-config API exposes each table's declared indexes and
// checks, so these regression pins read the schema without a database and
// without reaching into Drizzle's internal symbols.
function findIndex(table: Parameters<typeof getTableConfig>[0], name: string) {
  const index = getTableConfig(table).indexes.find(
    (candidate) => candidate.config.name === name,
  );
  if (!index) throw new Error(`Missing index: ${name}`);
  return index;
}

describe('practiceSessions schema indexes', () => {
  it('defines a user + startedAt index for session ordering', () => {
    expect(
      findIndex(practiceSessions, 'practice_sessions_user_started_at_idx')
        .config.unique,
    ).toBe(false);
  });

  it('defines a user + endedAt index for incomplete/completed session filters', () => {
    expect(
      findIndex(practiceSessions, 'practice_sessions_user_ended_at_idx').config
        .unique,
    ).toBe(false);
  });

  it('defines a partial unique index enforcing one incomplete session per user', () => {
    const index = findIndex(
      practiceSessions,
      PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
    );

    expect(index.config.unique).toBe(true);
    expect(index.config.where).toBeDefined();
  });
});

describe('practiceSessionQuestionStates schema checks', () => {
  it('uses the domain day bound for draft cumulative milliseconds', () => {
    const draftCumulativeMsCheck = getTableConfig(
      practiceSessionQuestionStates,
    ).checks.find(
      (check) =>
        check.name ===
        'practice_session_question_states_draft_cumulative_ms_chk',
    );
    if (!draftCumulativeMsCheck) throw new Error('Missing draft check');

    // A CHECK constraint cannot take bind parameters, so the bound must be
    // rendered into the SQL text rather than passed as a parameter.
    const { sql, params } = new PgDialect().sqlToQuery(
      draftCumulativeMsCheck.value,
    );
    expect(sql).toContain(String(DAY_MS));
    expect(params).not.toContain(DAY_MS);
  });
});

describe('attempts schema indexes', () => {
  it('defines a selected choice + question index for the composite FK', () => {
    expect(
      findIndex(attempts, ATTEMPTS_SELECTED_CHOICE_QUESTION_IDX).config.name,
    ).toBe('attempts_selected_choice_question_idx');
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

describe('stripeSubscriptions schema', () => {
  it('stores a non-null observation version starting at zero', () => {
    expect(getTableColumns(stripeSubscriptions).version).toMatchObject({
      default: 0,
      notNull: true,
    });
  });
});
