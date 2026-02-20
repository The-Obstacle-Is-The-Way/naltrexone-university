import type { Logger } from '@/src/application/ports/logger';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
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

export type AttemptPreviousAttemptOutput = {
  kind: 'attempt';
  attemptId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[];
  answeredAt: string; // ISO 8601
};

export type SessionUnansweredPreviousAttemptOutput = {
  kind: 'session_unanswered';
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[];
};

export type GetPreviousAttemptOutput =
  | AttemptPreviousAttemptOutput
  | SessionUnansweredPreviousAttemptOutput;

type PracticeSessionReader = Pick<
  PracticeSessionRepository,
  'findByIdAndUserId'
>;

export class GetPreviousAttemptUseCase {
  constructor(
    private readonly attempts: AttemptSingleQuestionReader,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
    private readonly sessions: PracticeSessionReader = {
      findByIdAndUserId: async () => null,
    },
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

    if (!attempt) {
      if (!input.sessionId) return null;

      const session = await this.sessions.findByIdAndUserId(
        input.sessionId,
        input.userId,
      );
      if (!session) return null;
      if (session.endedAt === null) return null;
      if (!session.questionIds.includes(input.questionId)) return null;

      const question = await this.questions.findPublishedById(input.questionId);
      if (!question) {
        this.logger.warn(
          { questionId: input.questionId, sessionId: input.sessionId },
          'Session unanswered reveal references missing question',
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
        kind: 'session_unanswered',
        correctChoiceId: correctChoice.id,
        explanationMd: question.explanationMd,
        referenceMd: question.referenceMd ?? null,
        choiceExplanations,
      };
    }
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
      kind: 'attempt',
      attemptId: attempt.id,
      selectedChoiceId: attempt.selectedChoiceId,
      isCorrect: attempt.isCorrect,
      correctChoiceId: correctChoice.id,
      explanationMd: question.explanationMd,
      referenceMd: question.referenceMd ?? null,
      choiceExplanations,
      answeredAt: attempt.answeredAt.toISOString(),
    };
  }
}
