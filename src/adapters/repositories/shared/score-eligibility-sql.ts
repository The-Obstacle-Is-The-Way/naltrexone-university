import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import {
  attempts,
  choices,
  practiceSessionQuestionStates,
  practiceSessions,
  questionHolds,
  questionRevisions,
  questions,
  questionWithdrawals,
} from '@/db/schema';

type QuestionColumns = { id: AnyColumn; status: AnyColumn };

/**
 * ADR-022 Amendment (DEBT-494): the SQL twin of the domain's contentInDoubt.
 * A question not published is in doubt when it is withdrawn, or held under
 * review on any revision. Retirement, neither, is not doubt. The overlay is
 * read only for a question not published. Holds have no index leading with
 * the question, so the hold check scans that small table.
 */
export function contentInDoubtSql(question: QuestionColumns): SQL {
  return sql`(${question.status} <> 'published' and (
    exists (
      select 1 from ${questionWithdrawals}
      where ${questionWithdrawals.questionId} = ${question.id}
    )
    or exists (
      select 1 from ${questionHolds}
      where ${questionHolds.questionId} = ${question.id}
        and ${questionHolds.liftedAt} is null
    )
  ))`;
}

/**
 * ADR-022 Amendment (DEBT-494): the SQL twin of the domain's
 * countsTowardScore. An item counts when the learner had a fair chance at it,
 * recorded when its session ended (null, never recorded, is a fair chance),
 * and its content is not now in doubt.
 */
export function countsTowardScoreSql(input: {
  fairChanceAtEnd: AnyColumn;
  question: QuestionColumns;
  /** `answerKeyCorrectedSql` for the item or attempt. */
  keyCorrected: SQL;
}): SQL {
  return sql`(coalesce(${input.fairChanceAtEnd}, true) and not ${contentInDoubtSql(input.question)} and not ${input.keyCorrected})`;
}

/** The revisions a learner's answers were graded against. */
export function answeredRevisionsSql(userId: string): SQL {
  return sql`select answered.question_revision_id
    from ${attempts} answered
    where answered.user_id = ${userId}
      and answered.selected_choice_id is not null`;
}

/** The revisions a learner's answered session items are bound to. */
export function answeredSessionItemRevisionsSql(userId: string): SQL {
  return sql`select item.question_revision_id
    from ${practiceSessionQuestionStates} item
    join ${practiceSessions} session on session.id = item.practice_session_id
    where session.user_id = ${userId}
      and item.latest_selected_choice_id is not null`;
}

const keyCorrectedRevisions = sql.identifier('key_corrected_revisions');

/**
 * ADR-022 Decision 4: of the revisions that `gradedRevisions` selects, those
 * no longer current whose answer key the current revision corrects. The key
 * is each correct choice's label and text. A query joins the set once, on
 * the revision each row was graded against (`keyCorrectedRevisionsOn`), so
 * the keys are compared once per superseded revision. Compared per row, they
 * were charged to every row by the planner, which tipped a learner's
 * dashboard read past the JIT threshold. Grouping by id tells the planner
 * the join adds no rows.
 */
export function keyCorrectedRevisionsSql(gradedRevisions: SQL): SQL {
  return sql`(
    with superseded as (
      select revision.id, question.current_revision_id
      from ${questionRevisions} revision
      join ${questions} question on question.id = revision.question_id
      where revision.id in (${gradedRevisions})
        and revision.id <> question.current_revision_id
    ), answer_keys as (
      select choice.question_revision_id as id,
        string_agg(
          choice.label || chr(31) || choice.text_md,
          chr(30) order by choice.label, choice.text_md
        ) as answer_key
      from ${choices} choice
      where choice.is_correct
        and choice.question_revision_id in (
          select id from superseded
          union
          select current_revision_id from superseded
        )
      group by choice.question_revision_id
    )
    select superseded.id
    from superseded
    left join answer_keys graded_key on graded_key.id = superseded.id
    left join answer_keys current_key
      on current_key.id = superseded.current_revision_id
    where graded_key.answer_key is distinct from current_key.answer_key
    group by superseded.id
  ) ${keyCorrectedRevisions}`;
}

/** Joins `keyCorrectedRevisionsSql` on the revision a row was graded against. */
export function keyCorrectedRevisionsOn(gradedRevisionId: AnyColumn): SQL {
  return sql`${keyCorrectedRevisions}.id = ${gradedRevisionId}`;
}

/**
 * ADR-022 Decision 4: the SQL twin of an answered item whose
 * `answerKeyChanged` holds, in a query that joins `keyCorrectedRevisionsSql`.
 */
export function answerKeyCorrectedSql(answered: SQL): SQL {
  return sql`(${answered} and ${keyCorrectedRevisions}.id is not null)`;
}
