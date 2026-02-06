import type { Question } from '@/src/domain/entities';
import {
  gradeAnswer,
  shouldShowExplanation as sessionShouldShowExplanation,
} from '@/src/domain/services';
import { ApplicationError } from '../errors';
import type {
  AttemptWriter,
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';
import { buildShuffledChoiceViews } from '../shared/shuffled-choice-views';

export type SubmitAnswerInput = {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
  timeSpentSeconds?: number;
};

export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
  choiceExplanations: ChoiceExplanation[];
};

export type ChoiceExplanation = {
  choiceId: string;
  displayLabel: string;
  textMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
};

export class SubmitAnswerUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptWriter,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  private mapChoiceExplanations(
    question: Question,
    userId: string,
  ): ChoiceExplanation[] {
    return buildShuffledChoiceViews(question, userId).map((choice) => ({
      choiceId: choice.choiceId,
      displayLabel: choice.displayLabel,
      textMd: choice.textMd,
      isCorrect: choice.isCorrect,
      explanationMd: choice.explanationMd,
    }));
  }

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const selected = question.choices.find((c) => c.id === input.choiceId);
    if (!selected) {
      throw new ApplicationError('NOT_FOUND', 'Choice not found');
    }

    const grade = gradeAnswer(question, input.choiceId);

    const session = input.sessionId
      ? await this.sessions.findByIdAndUserId(input.sessionId, input.userId)
      : null;

    if (input.sessionId && !session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    const rawTimeSpentSeconds = input.timeSpentSeconds;
    const timeSpentSeconds =
      typeof rawTimeSpentSeconds === 'number' &&
      Number.isFinite(rawTimeSpentSeconds)
        ? Math.max(0, rawTimeSpentSeconds)
        : 0;

    const attempt = await this.attempts.insert({
      userId: input.userId,
      questionId: question.id,
      practiceSessionId: session ? session.id : null,
      selectedChoiceId: input.choiceId,
      isCorrect: grade.isCorrect,
      timeSpentSeconds,
    });

    if (session && session.endedAt === null) {
      try {
        await this.sessions.recordQuestionAnswer({
          sessionId: session.id,
          userId: input.userId,
          questionId: question.id,
          selectedChoiceId: input.choiceId,
          isCorrect: grade.isCorrect,
          answeredAt: attempt.answeredAt,
        });
      } catch (error) {
        try {
          const rolledBack = await this.attempts.deleteById(
            attempt.id,
            input.userId,
          );
          if (!rolledBack) {
            throw new ApplicationError(
              'INTERNAL_ERROR',
              'Failed to roll back attempt after session state persistence error',
            );
          }
        } catch (rollbackError) {
          if (rollbackError instanceof ApplicationError) {
            throw rollbackError;
          }

          throw new ApplicationError(
            'INTERNAL_ERROR',
            'Failed to roll back attempt after session state persistence error',
          );
        }

        throw error;
      }
    }

    const shouldShowExplanation =
      !session || sessionShouldShowExplanation(session);
    const explanationMd = shouldShowExplanation ? question.explanationMd : null;
    const choiceExplanations = shouldShowExplanation
      ? this.mapChoiceExplanations(question, input.userId)
      : [];

    return {
      attemptId: attempt.id,
      isCorrect: grade.isCorrect,
      correctChoiceId: grade.correctChoiceId,
      explanationMd,
      choiceExplanations,
    };
  }
}
