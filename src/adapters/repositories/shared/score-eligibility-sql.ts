import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import { questionHolds, questionWithdrawals } from '@/db/schema';

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
}): SQL {
  return sql`(coalesce(${input.fairChanceAtEnd}, true) and not ${contentInDoubtSql(input.question)})`;
}
