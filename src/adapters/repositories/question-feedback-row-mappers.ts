import type { QuestionFeedback as QuestionFeedbackRow } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFeedback,
  QuestionRatingFeedback,
  QuestionReportFeedback,
} from '@/src/domain/entities';

export function toQuestionFeedbackDomain(
  row: QuestionFeedbackRow,
): QuestionFeedback {
  if (row.kind === 'rating') {
    if (row.category !== null || row.comment !== null) {
      throw invalidQuestionFeedbackRow();
    }

    return {
      id: row.id,
      userId: row.userId,
      questionId: row.questionId,
      attemptId: row.attemptId,
      practiceSessionId: row.practiceSessionId,
      kind: 'rating',
      rating: row.rating,
      category: null,
      comment: null,
      createdAt: row.createdAt,
    } satisfies QuestionRatingFeedback;
  }

  if (row.rating !== null || row.category === null) {
    throw invalidQuestionFeedbackRow();
  }

  return {
    id: row.id,
    userId: row.userId,
    questionId: row.questionId,
    attemptId: row.attemptId,
    practiceSessionId: row.practiceSessionId,
    kind: 'report',
    rating: null,
    category: row.category,
    comment: row.comment,
    createdAt: row.createdAt,
  } satisfies QuestionReportFeedback;
}

function invalidQuestionFeedbackRow(): ApplicationError {
  return new ApplicationError(
    'INTERNAL_ERROR',
    'Invalid question feedback row',
  );
}
