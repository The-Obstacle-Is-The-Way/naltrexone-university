import { ApplicationError } from '@/src/application/errors';
import type { RecentAttempt } from '@/src/application/ports/repositories';
import { type Attempt, isValidAttemptProvenance } from '@/src/domain/entities';

type AttemptRowBase = {
  id: string;
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string | null;
  isCorrect: boolean;
  timeSpentSeconds: number;
  retryOfAttemptId?: string | null;
  retryOrigin?: Attempt['retryOrigin'];
  retrySessionId?: string | null;
  answeredAt: Date;
};

export function requireSelectedChoiceId(row: {
  id?: string | null;
  selectedChoiceId?: string | null;
}): string {
  if (!row.selectedChoiceId) {
    const idPart = row.id ? ` ${row.id}` : '';
    throw new ApplicationError(
      'INTERNAL_ERROR',
      `Attempt${idPart} selectedChoiceId must not be null`,
    );
  }

  return row.selectedChoiceId;
}

export function toAttemptDomain(row: AttemptRowBase): Attempt {
  const selectedChoiceId = requireSelectedChoiceId(row);
  const retryOfAttemptId = row.retryOfAttemptId ?? null;
  const retryOrigin = row.retryOrigin ?? null;
  const retrySessionId = row.retrySessionId ?? null;

  if (
    !isValidAttemptProvenance({
      retryOfAttemptId,
      retryOrigin,
      retrySessionId,
    })
  ) {
    const idPart = row.id ? ` ${row.id}` : '';
    throw new ApplicationError(
      'INTERNAL_ERROR',
      `Attempt${idPart} has invalid retry provenance`,
    );
  }

  return {
    id: row.id,
    userId: row.userId,
    questionId: row.questionId,
    practiceSessionId: row.practiceSessionId ?? null,
    selectedChoiceId,
    isCorrect: row.isCorrect,
    timeSpentSeconds: row.timeSpentSeconds,
    retryOfAttemptId,
    retryOrigin,
    retrySessionId,
    answeredAt: row.answeredAt,
  };
}

export function toRecentAttempt(
  row: AttemptRowBase & { sessionMode: 'tutor' | 'exam' | null },
): RecentAttempt {
  return {
    ...toAttemptDomain(row),
    sessionMode: row.sessionMode,
  };
}
