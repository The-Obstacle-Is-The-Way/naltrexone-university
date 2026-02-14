import type { AnyColumn } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export function latestAttemptRankSql(columns: {
  questionId: AnyColumn;
  answeredAt: AnyColumn;
  id: AnyColumn;
}) {
  return sql<number>`row_number() over (partition by ${columns.questionId} order by ${columns.answeredAt} desc, ${columns.id} desc)`;
}
