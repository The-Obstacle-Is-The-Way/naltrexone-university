import type { Logger } from '@/src/application/ports/logger';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';
import {
  isOmittedOutcome,
  type PracticeMode,
  selectedChoiceIdOrNull,
} from '@/src/domain/value-objects';
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
  sessionMode: PracticeMode | null;
  attemptId: string;
  selectedChoiceId: string | null;
  isOmitted: boolean;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[];
  answeredAt: string; // ISO 8601
};

export type SessionUnansweredPreviousAttemptOutput = {
  kind: 'session_unanswered';
  sessionMode: PracticeMode | null;
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

function mapChoiceExplanations(
  question: Question,
  userId: string,
): ChoiceExplanation[] {
  return buildShuffledChoiceViews(question, userId).map((view) => ({
    choiceId: view.choiceId,
    displayLabel: view.displayLabel,
    textMd: view.textMd,
    isCorrect: view.isCorrect,
    explanationMd: view.explanationMd,
  }));
}

function requireCorrectChoiceId(question: Question): string {
  const correctChoice = question.choices.find((choice) => choice.isCorrect);
  if (!correctChoice) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      `Question ${question.id} has no correct choice`,
    );
  }
  return correctChoice.id;
}

export class GetPreviousAttemptUseCase {
  constructor(
    private readonly attempts: AttemptSingleQuestionReader,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
    private readonly sessions: PracticeSessionReader,
  ) {}

  async execute(
    input: GetPreviousAttemptInput,
  ): Promise<GetPreviousAttemptOutput | null> {
    if (input.attemptId && input.sessionId) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Provide either attemptId or sessionId, not both',
      );
    }

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
      // Only a session review reveals an item the learner left unanswered.
      // Stryker disable next-line ConditionalExpression: a lookup without a session id finds no session, so the reads below also end in null
      if (!input.sessionId) return null;

      const session = await this.sessions.findByIdAndUserId(
        input.sessionId,
        input.userId,
      );
      if (!session) return null;
      if (session.endedAt === null) return null;
      const item = session.questionStates.find(
        (state) => state.questionId === input.questionId,
      );
      if (!item) return null;

      // ADR-021: the revision the item was bound to. The learner never
      // attempted it, so a withdrawn question reveals nothing (§3).
      const question = await this.questions.findByIdForSession(item);
      if (!question) {
        this.logger.warn(
          { questionId: input.questionId, sessionId: input.sessionId },
          'Session unanswered reveal references missing question',
        );
        return null;
      }
      if (question.status !== 'published') return null;

      return {
        kind: 'session_unanswered',
        sessionMode: session.mode,
        correctChoiceId: requireCorrectChoiceId(question),
        explanationMd: question.explanationMd,
        referenceMd: question.referenceMd ?? null,
        choiceExplanations: mapChoiceExplanations(question, input.userId),
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

    let sessionMode: PracticeMode | null = null;
    // Stryker disable next-line ConditionalExpression: a standalone attempt has no session, and a lookup without an id finds none
    if (attempt.practiceSessionId) {
      const attemptSession = await this.sessions.findByIdAndUserId(
        attempt.practiceSessionId,
        input.userId,
      );
      // An attempt inside an exam still in progress is not yet an answer to
      // review.
      if (attemptSession?.mode === 'exam' && attemptSession.endedAt === null) {
        return null;
      }
      sessionMode = attemptSession?.mode ?? null;
    }

    // ADR-021: the revision the attempt graded.
    const question = await this.questions.findByIdForSession(attempt);
    if (!question) {
      this.logger.warn(
        { questionId: attempt.questionId },
        'Previous attempt references missing question',
      );
      return null;
    }

    return {
      kind: 'attempt',
      sessionMode,
      attemptId: attempt.id,
      selectedChoiceId: selectedChoiceIdOrNull(attempt.outcome),
      isOmitted: isOmittedOutcome(attempt.outcome),
      isCorrect: attempt.isCorrect,
      correctChoiceId: requireCorrectChoiceId(question),
      explanationMd: question.explanationMd,
      referenceMd: question.referenceMd ?? null,
      choiceExplanations: mapChoiceExplanations(question, input.userId),
      answeredAt: attempt.answeredAt.toISOString(),
    };
  }
}
