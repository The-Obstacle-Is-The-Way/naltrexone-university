import { createTableRelationsHelpers, getTableColumns } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { DAY_MS } from '@/src/domain/services/time-constants';
import type {
  NewPendingStripeCancellation,
  PendingStripeCancellation,
  pendingStripeCancellations,
} from './schema';
import {
  ATTEMPTS_QUESTION_REVISION_FK,
  ATTEMPTS_SELECTED_CHOICE_QUESTION_IDX,
  ATTEMPTS_SELECTED_CHOICE_REVISION_FK,
  attempts,
  CHOICES_ID_QUESTION_REVISION_ID_UQ,
  CHOICES_QUESTION_REVISION_FK,
  CHOICES_QUESTION_REVISION_ID_LABEL_UQ,
  CHOICES_QUESTION_REVISION_ID_SORT_ORDER_UQ,
  choices,
  PRACTICE_SESSION_QUESTION_STATES_DRAFT_CHOICE_REVISION_FK,
  PRACTICE_SESSION_QUESTION_STATES_LATEST_CHOICE_REVISION_FK,
  PRACTICE_SESSION_QUESTION_STATES_QUESTION_REVISION_FK,
  PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
  practiceSessionQuestionStates,
  practiceSessions,
  QUESTION_REVISIONS_ID_QUESTION_ID_UQ,
  QUESTIONS_CURRENT_REVISION_FK,
  questionRevisions,
  questionRevisionsRelations,
  questions,
  questionsRelations,
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
    const predicate = index.config.where;
    if (!predicate) throw new Error('Expected a partial index predicate');
    // Exact text: a containment check would also accept a predicate that
    // disables the index, such as `ended_at IS NULL AND false`.
    expect(new PgDialect().sqlToQuery(predicate).sql).toBe('ended_at IS NULL');
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
    // Exact text: a containment check would also accept a wider bound whose
    // digits begin with DAY_MS's.
    expect(sql).toBe(
      `"practice_session_question_states"."draft_cumulative_ms" BETWEEN 0 AND ${DAY_MS}`,
    );
    expect(params).toEqual([]);
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

// ADR-021 phase 1: every pointer at a revision is keyed by (revision id,
// question id), so a row can point only at a revision of its own question.
describe('question revision keys', () => {
  function describeForeignKey(
    table: Parameters<typeof getTableConfig>[0],
    name: string,
  ) {
    const foreignKey = getTableConfig(table).foreignKeys.find(
      (candidate) => candidate.getName() === name,
    );
    if (!foreignKey) throw new Error(`Missing foreign key: ${name}`);
    const reference = foreignKey.reference();
    return {
      columns: reference.columns.map((column) => column.name),
      foreignTable: getTableConfig(reference.foreignTable).name,
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      onDelete: foreignKey.onDelete,
    };
  }

  it('deletes a question together with its revisions', () => {
    const [toQuestion] = getTableConfig(questionRevisions).foreignKeys;
    const reference = toQuestion?.reference();

    expect(toQuestion?.onDelete).toBe('cascade');
    expect(reference && getTableConfig(reference.foreignTable).name).toBe(
      'questions',
    );
  });

  it('gives every revision a unique (id, question_id) key for the composite references', () => {
    const { config } = findIndex(
      questionRevisions,
      QUESTION_REVISIONS_ID_QUESTION_ID_UQ,
    );

    expect(config.unique).toBe(true);
    expect(
      config.columns.map((column) => ('name' in column ? column.name : null)),
    ).toEqual(['id', 'question_id']);
  });

  it.each([
    [
      QUESTIONS_CURRENT_REVISION_FK,
      questions,
      ['current_revision_id', 'id'],
      'no action',
    ],
    [
      CHOICES_QUESTION_REVISION_FK,
      choices,
      ['question_revision_id', 'question_id'],
      'cascade',
    ],
    [
      ATTEMPTS_QUESTION_REVISION_FK,
      attempts,
      ['question_revision_id', 'question_id'],
      'restrict',
    ],
    [
      PRACTICE_SESSION_QUESTION_STATES_QUESTION_REVISION_FK,
      practiceSessionQuestionStates,
      ['question_revision_id', 'question_id'],
      'restrict',
    ],
  ] as const)(
    '%s points only at a revision of its own question',
    (name, table, columns, onDelete) => {
      expect(describeForeignKey(table, name)).toEqual({
        columns,
        foreignTable: 'question_revisions',
        foreignColumns: ['id', 'question_id'],
        onDelete,
      });
    },
  );

  // ADR-021 phase 2a: a history row can select only a choice of the revision
  // it is bound to.
  it('gives every choice a unique (id, question_revision_id) key for the selection references', () => {
    const { config } = findIndex(choices, CHOICES_ID_QUESTION_REVISION_ID_UQ);

    expect(config.unique).toBe(true);
    expect(
      config.columns.map((column) => ('name' in column ? column.name : null)),
    ).toEqual(['id', 'question_revision_id']);
  });

  // ADR-021 phase 2b: a newer revision may reuse its question's labels and
  // sort orders, so both are unique within a revision, not a question.
  it.each([
    [CHOICES_QUESTION_REVISION_ID_LABEL_UQ, ['question_revision_id', 'label']],
    [
      CHOICES_QUESTION_REVISION_ID_SORT_ORDER_UQ,
      ['question_revision_id', 'sort_order'],
    ],
  ] as const)('keeps %s unique within a revision', (name, columns) => {
    const { config } = findIndex(choices, name);

    expect(config.unique).toBe(true);
    expect(
      config.columns.map((column) => ('name' in column ? column.name : null)),
    ).toEqual(columns);
  });

  it('has no per-question label or sort-order key', () => {
    const names = getTableConfig(choices).indexes.map(
      (index) => index.config.name,
    );

    expect(names).not.toContain('choices_question_id_label_uq');
    expect(names).not.toContain('choices_question_id_sort_order_uq');
  });

  it.each([
    [
      ATTEMPTS_SELECTED_CHOICE_REVISION_FK,
      attempts,
      ['selected_choice_id', 'question_revision_id'],
    ],
    [
      PRACTICE_SESSION_QUESTION_STATES_LATEST_CHOICE_REVISION_FK,
      practiceSessionQuestionStates,
      ['latest_selected_choice_id', 'question_revision_id'],
    ],
    [
      PRACTICE_SESSION_QUESTION_STATES_DRAFT_CHOICE_REVISION_FK,
      practiceSessionQuestionStates,
      ['draft_selected_choice_id', 'question_revision_id'],
    ],
  ] as const)(
    '%s selects only a choice of the bound revision',
    (name, table, columns) => {
      expect(describeForeignKey(table, name)).toEqual({
        columns,
        foreignTable: 'choices',
        foreignColumns: ['id', 'question_revision_id'],
        onDelete: 'restrict',
      });
    },
  );
});

describe('question relations (ADR-021)', () => {
  it('reads choices through a revision, never by question alone', () => {
    const byQuestion = questionsRelations.config(
      createTableRelationsHelpers(questions),
    );
    const byRevision = questionRevisionsRelations.config(
      createTableRelationsHelpers(questionRevisions),
    );

    expect(Object.keys(byQuestion)).not.toContain('choices');
    expect(Object.keys(byRevision)).toContain('choices');
  });
});
