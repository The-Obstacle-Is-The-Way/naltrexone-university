import type { Logger } from '@/src/application/ports/logger';
import type { AttemptRetryOrigin, Question } from '@/src/domain/entities';
import { isValidAttemptProvenance } from '@/src/domain/entities';
import {
  gradeAnswer,
  shouldShowExplanation as sessionShouldShowExplanation,
} from '@/src/domain/services';
import { ApplicationError } from '../errors';
import type {
  AttemptSingleQuestionReader,
  AttemptWriter,
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';
import {
  buildShuffledChoiceViews,
  type ChoiceExplanation,
} from '../shared/shuffled-choice-views';

export type SubmitAnswerInput = {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
  timeSpentSeconds?: number;
  retryOfAttemptId?: string;
  retryOrigin?: AttemptRetryOrigin;
  retrySessionId?: string;
};

export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string | null;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[];
};

export const SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS = 86_400;

export class SubmitAnswerUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptWriter & AttemptSingleQuestionReader,
    private readonly sessions: PracticeSessionRepository,
    private readonly logger: Logger,
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

  private safeLog(
    level: 'info' | 'warn' | 'error',
    context: Record<string, unknown>,
    msg: string,
  ): void {
    try {
      this.logger[level](context, msg);
    } catch {
      // Logging is best-effort and must not change submit behavior.
    }
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

    const retryOfAttemptId = input.retryOfAttemptId ?? null;
    const retryOrigin = input.retryOrigin ?? null;
    const retrySessionId = input.retrySessionId ?? null;

    if (
      !isValidAttemptProvenance({
        retryOfAttemptId,
        retryOrigin,
        retrySessionId,
      })
    ) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid retry provenance metadata',
      );
    }

    if (retryOfAttemptId !== null) {
      const parentAttempt = await this.attempts.findByIdAndUserId(
        retryOfAttemptId,
        input.userId,
      );
      if (!parentAttempt) {
        throw new ApplicationError(
          'NOT_FOUND',
          'Retry parent attempt not found',
        );
      }
      if (parentAttempt.questionId !== question.id) {
        throw new ApplicationError(
          'NOT_FOUND',
          'Retry parent attempt does not belong to the requested question',
        );
      }
    }

    const session = input.sessionId
      ? await this.sessions.findByIdAndUserId(input.sessionId, input.userId)
      : null;

    if (input.sessionId && !session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (session && !session.questionIds.includes(question.id)) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Question is not part of this practice session',
      );
    }

    if (session && session.endedAt !== null) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const rawTimeSpentSeconds = input.timeSpentSeconds;
    const timeSpentSeconds =
      typeof rawTimeSpentSeconds === 'number' &&
      Number.isFinite(rawTimeSpentSeconds)
        ? Math.min(
            SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS,
            Math.max(0, rawTimeSpentSeconds),
          )
        : 0;

    const attempt = await this.attempts.insert({
      userId: input.userId,
      questionId: question.id,
      practiceSessionId: session ? session.id : null,
      selectedChoiceId: input.choiceId,
      isCorrect: grade.isCorrect,
      timeSpentSeconds,
      retryOfAttemptId,
      retryOrigin,
      retrySessionId,
    });

    if (retryOrigin !== null) {
      this.safeLog(
        'info',
        {
          event: 'retry_submitted',
          retryOrigin,
          isCorrect: grade.isCorrect,
          hasParent: retryOfAttemptId !== null,
          hasRetrySessionId: retrySessionId !== null,
        },
        'Retry submitted',
      );
    }

    if (session) {
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
          this.safeLog(
            'error',
            {
              attemptId: attempt.id,
              sessionError: error,
              rollbackError,
            },
            'Failed to roll back orphaned attempt after session update failure',
          );

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
      correctChoiceId: shouldShowExplanation ? grade.correctChoiceId : null,
      explanationMd,
      referenceMd: shouldShowExplanation ? question.referenceMd : null,
      choiceExplanations,
    };
  }
}
