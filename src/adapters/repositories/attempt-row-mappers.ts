import { ApplicationError } from '@/src/application/errors';
import type { RecentAttempt } from '@/src/application/ports/repositories';
import type { Attempt } from '@/src/domain/entities';

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

export function toAttemptDomain(row: {
  id: string;
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string | null;
  isCorrect: boolean;
  timeSpentSeconds: number;
  answeredAt: Date;
}): Attempt {
  const selectedChoiceId = requireSelectedChoiceId(row);

  return {
    id: row.id,
    userId: row.userId,
    questionId: row.questionId,
    practiceSessionId: row.practiceSessionId ?? null,
    selectedChoiceId,
    isCorrect: row.isCorrect,
    timeSpentSeconds: row.timeSpentSeconds,
    answeredAt: row.answeredAt,
  };
}

export function toRecentAttempt(row: {
  id: string;
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string | null;
  isCorrect: boolean;
  timeSpentSeconds: number;
  answeredAt: Date;
  sessionMode: 'tutor' | 'exam' | null;
}): RecentAttempt {
  return {
    ...toAttemptDomain(row),
    sessionMode: row.sessionMode,
  };
}
