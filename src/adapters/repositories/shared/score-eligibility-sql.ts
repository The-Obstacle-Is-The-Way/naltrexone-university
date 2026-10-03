import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import { choices, questionHolds, questionWithdrawals } from '@/db/schema';

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

function answerKeyOf(revisionId: AnyColumn): SQL {
  return sql`(
    select string_agg(
      ${choices.label} || chr(31) || ${choices.textMd},
      chr(30) order by ${choices.label}, ${choices.textMd}
    )
    from ${choices}
    where ${choices.questionRevisionId} = ${revisionId}
      and ${choices.isCorrect}
  )`;
}

/**
 * ADR-022 Decision 4: the SQL twin of an answered item whose
 * `answerKeyChanged` holds. The key is each correct choice's label and text.
 * It is compared only when the graded revision is not the current one.
 */
export function answerKeyCorrectedSql(input: {
  answered: SQL;
  gradedRevisionId: AnyColumn;
  currentRevisionId: AnyColumn;
}): SQL {
  return sql`(${input.answered}
    and ${input.gradedRevisionId} <> ${input.currentRevisionId}
    and ${answerKeyOf(input.gradedRevisionId)} is distinct from ${answerKeyOf(input.currentRevisionId)})`;
}
