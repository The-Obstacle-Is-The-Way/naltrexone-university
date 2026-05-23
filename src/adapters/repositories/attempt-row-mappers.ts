import { ApplicationError } from '@/src/application/errors';
import type { RecentAttempt } from '@/src/application/ports/repositories';
import { type Attempt, isValidAttemptProvenance } from '@/src/domain/entities';
import { createAttempt } from '@/src/domain/entities/attempt';
import { isDomainError } from '@/src/domain/errors';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';

type AttemptRowBase = {
  id: string;
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string | null;
  isOmitted?: boolean;
  isCorrect: boolean;
  timeSpentSeconds: number;
  retryOfAttemptId?: string | null;
  retryOrigin?: Attempt['retryOrigin'];
  retrySessionId?: string | null;
  answeredAt: Date;
};

function requireSelectedChoiceId(row: {
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

function toAnswerOutcome(row: AttemptRowBase): Attempt['outcome'] {
  if (row.isOmitted) {
    if (row.selectedChoiceId !== null) {
      const idPart = row.id ? ` ${row.id}` : '';
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Attempt${idPart} cannot be omitted with a selected choice`,
      );
    }

    return omittedOutcome();
  }

  return answeredOutcome(requireSelectedChoiceId(row));
}

export function toAttemptDomain(row: AttemptRowBase): Attempt {
  const outcome = toAnswerOutcome(row);
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

  try {
    return createAttempt({
      id: row.id,
      userId: row.userId,
      questionId: row.questionId,
      practiceSessionId: row.practiceSessionId ?? null,
      outcome,
      isCorrect: row.isCorrect,
      timeSpentSeconds: row.timeSpentSeconds,
      retryOfAttemptId,
      retryOrigin,
      retrySessionId,
      answeredAt: row.answeredAt,
    });
  } catch (error) {
    if (isDomainError(error) && error.code === 'INVALID_ATTEMPT') {
      const idPart = row.id ? ` ${row.id}` : '';
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Attempt${idPart} cannot be omitted and correct`,
      );
    }

    throw error;
  }
}

export function toRecentAttempt(
  row: AttemptRowBase & { sessionMode: 'tutor' | 'exam' | null },
): RecentAttempt {
  return {
    ...toAttemptDomain(row),
    sessionMode: row.sessionMode,
  };
}
