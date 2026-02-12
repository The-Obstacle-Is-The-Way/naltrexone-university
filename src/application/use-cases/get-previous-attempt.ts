import type { Logger } from '@/src/application/ports/logger';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { ApplicationError } from '../errors';
import type { AttemptSingleQuestionReader } from '../ports/attempt-repository';
import { buildShuffledChoiceViews } from '../shared/shuffled-choice-views';
import type { ChoiceExplanation } from './submit-answer';

export type GetPreviousAttemptInput = {
  userId: string;
  questionId: string;
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
    const attempt = await this.attempts.findLatestByUserAndQuestion(
      input.userId,
      input.questionId,
    );

    if (!attempt) return null;

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
