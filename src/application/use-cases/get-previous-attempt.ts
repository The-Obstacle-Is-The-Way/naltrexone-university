import type { Logger } from '@/src/application/ports/logger';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { ApplicationError } from '../errors';
import type { AttemptSingleQuestionReader } from '../ports/attempt-repository';
import {
  buildShuffledChoiceViews,
  type ChoiceExplanation,
} from '../shared/shuffled-choice-views';

export type GetPreviousAttemptInput = {
  userId: string;
  questionId: string;
  attemptId?: string;
  sessionId?: string;
};

export type GetPreviousAttemptOutput = {
  attemptId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
  choiceExplanations: ChoiceExplanation[];
  answeredAt: string; // ISO 8601
};

export class GetPreviousAttemptUseCase {
  constructor(
    private readonly attempts: AttemptSingleQuestionReader,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: GetPreviousAttemptInput,
  ): Promise<GetPreviousAttemptOutput | null> {
    const attempt = input.attemptId
      ? await this.attempts.findByIdAndUserId(input.attemptId, input.userId)
      : input.sessionId
        ? await this.attempts.findBySessionIdAndQuestionId(
            input.sessionId,
            input.userId,
            input.questionId,
          )
        : await this.attempts.findLatestByUserAndQuestion(
            input.userId,
            input.questionId,
          );

    if (!attempt) return null;
    if (attempt.questionId !== input.questionId) {
      this.logger.warn(
        {
          attemptId: input.attemptId,
          questionId: input.questionId,
          attemptQuestionId: attempt.questionId,
        },
        'Previous attempt does not match requested question',
      );
      throw new ApplicationError(
        'NOT_FOUND',
        'Previous attempt does not belong to the requested question',
      );
    }

    const question = await this.questions.findPublishedById(attempt.questionId);

    if (!question) {
      this.logger.warn(
        { questionId: attempt.questionId },
        'Previous attempt references missing question',
      );
      return null;
    }

    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (!correctChoice) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Question ${question.id} has no correct choice`,
      );
    }

    const choiceExplanations: ChoiceExplanation[] = buildShuffledChoiceViews(
      question,
      input.userId,
    ).map((view) => ({
      choiceId: view.choiceId,
      displayLabel: view.displayLabel,
      textMd: view.textMd,
      isCorrect: view.isCorrect,
      explanationMd: view.explanationMd,
    }));

    return {
      attemptId: attempt.id,
      selectedChoiceId: attempt.selectedChoiceId,
      isCorrect: attempt.isCorrect,
      correctChoiceId: correctChoice.id,
      explanationMd: question.explanationMd,
      choiceExplanations,
      answeredAt: attempt.answeredAt.toISOString(),
    };
  }
}
