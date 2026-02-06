import type { Logger } from '@/src/application/ports/logger';
import type { Question } from '@/src/domain/entities';

export function enrichWithQuestion<T, R>(input: {
  rows: readonly T[];
  getQuestionId: (row: T) => string;
  questionsById: ReadonlyMap<string, Question>;
  available: (row: T, question: Question) => R;
  unavailable: (row: T) => R;
  logger: Logger;
  missingQuestionMessage: string;
}): R[] {
  const result: R[] = [];

  for (const row of input.rows) {
    const questionId = input.getQuestionId(row);
    const question = input.questionsById.get(questionId);
    if (!question) {
      input.logger.warn({ questionId }, input.missingQuestionMessage);
      result.push(input.unavailable(row));
      continue;
    }

    result.push(input.available(row, question));
  }

  return result;
}
