import {
  ApplicationError,
  isApplicationError,
  practiceSessionAlreadyEndedError,
} from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptWriter,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { fetchSessionOwnedQuestionsById } from '@/src/application/shared/fetch-session-owned-questions-by-id';
import type { PracticeSession } from '@/src/domain/entities';
import {
  computeExamDeadline,
  gradeAnswer,
  MS_PER_SECOND,
} from '@/src/domain/services';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import {
  type PracticeSessionSummary,
  projectPracticeSessionSummary,
} from './practice-session-summary';
import { SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS } from './save-exam-draft-answer';

/**
 * BUG-254 grace window for the single-question expiry flush.
 *
 * The ordinary `SaveExamDraftAnswerUseCase` rejects any draft save at/after the
 * deadline. A selection made just before zero can therefore lose its save to the
 * network/event-loop hop and arrive after the deadline. This flush is accepted
 * only from the deadline up to this short window after it.
 *
 * The window is sized to one client mutation round-trip (the doomed draft save's
 * timeout is `STANDARD_MUTATION_TIMEOUT_MS` = 15s) plus the 1s exam-timer tick:
 * it must be at least that long so a genuinely slow network at expiry does not
 * push the follow-up finalize past the window and drop a real answer (the very
 * bug this fixes). It is deliberately kept this tight — not minutes — so the
 * post-deadline window cannot be used to deliberately answer a fresh question
 * (CodeRabbit PR #476 hardening: there is no server "active question" cursor in
 * free-navigation exam mode, so the tight window is the integrity bound).
 */
export const FINALIZE_FLUSH_DEADLINE_GRACE_MS = 15_000;

export type FinalizeExamFinalDraftAnswer = {
  questionId: string;
  selectedChoiceId: string | null;
  cumulativeMs: number;
};

export type FinalizeExamAnswersInput = {
  userId: string;
  sessionId: string;
  finalDraftAnswer?: FinalizeExamFinalDraftAnswer;
};

export type FinalizeExamAnswersOutput = PracticeSessionSummary;

export type FinalizeExamAnswersWriteTransaction = <T>(
  fn: (tx: {
    questions: QuestionRepository;
    attempts: AttemptWriter;
    sessions: PracticeSessionRepository;
  }) => Promise<T>,
) => Promise<T>;

const noopFinalizeLogger: Pick<Logger, 'warn'> = {
  warn: () => undefined,
};
const ATTEMPT_ALREADY_ANSWERED_CONFLICT_MESSAGE =
  'This question has already been answered in this session';

function isAttemptAlreadyAnsweredConflict(error: unknown): boolean {
  return (
    isApplicationError(error) &&
    error.code === 'CONFLICT' &&
    error.message === ATTEMPT_ALREADY_ANSWERED_CONFLICT_MESSAGE
  );
}

export function computeFinalExamEndedAt(input: {
  now: Date;
  deadline: Date | null;
  latestAnsweredAt: Date | null;
}): Date {
  const { now, deadline, latestAnsweredAt } = input;
  if (deadline === null) {
    return now;
  }

  const latestAnsweredAtMs =
    latestAnsweredAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return new Date(
    Math.min(now.getTime(), Math.max(deadline.getTime(), latestAnsweredAtMs)),
  );
}

function clampDraftCumulativeMs(cumulativeMs: number): number {
  if (!Number.isFinite(cumulativeMs)) return 0;
  return Math.min(SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS, Math.max(0, cumulativeMs));
}

export class FinalizeExamAnswersUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptWriter,
    private readonly sessions: PracticeSessionRepository,
    private readonly writeTransaction: FinalizeExamAnswersWriteTransaction,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: Pick<Logger, 'warn'> = noopFinalizeLogger,
  ) {}

  async execute(
    input: FinalizeExamAnswersInput,
  ): Promise<FinalizeExamAnswersOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (session.mode !== 'exam') {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Finalize exam is only available in exam mode',
      );
    }

    if (session.endedAt) {
      throw new ApplicationError(
        'CONFLICT',
        'Cannot finalize a completed session',
      );
    }

    const finalizationNow = this.now();

    const endedSession = await this.writeTransaction(async (tx) => {
      const loadedSession = await tx.sessions.findByIdAndUserId(
        input.sessionId,
        input.userId,
      );
      if (!loadedSession) {
        throw new ApplicationError('NOT_FOUND', 'Practice session not found');
      }

      if (loadedSession.mode !== 'exam') {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Finalize exam is only available in exam mode',
        );
      }

      if (loadedSession.endedAt) {
        throw new ApplicationError(
          'CONFLICT',
          'Cannot finalize a completed session',
        );
      }

      // BUG-254: apply the single-question expiry flush BEFORE grading so the
      // selection visible on-screen at expiry is graded instead of omitted.
      // Grading below stays server-authoritative; this only persists the
      // validated candidate draft inside the same finalize transaction.
      const activeSession = input.finalDraftAnswer
        ? await this.applyFinalDraftAnswer(
            tx,
            loadedSession,
            input.finalDraftAnswer,
            finalizationNow,
          )
        : loadedSession;
      const deadline = computeExamDeadline(activeSession);
      const finalDraftFlushAfterDeadline =
        input.finalDraftAnswer !== undefined &&
        deadline !== null &&
        finalizationNow.getTime() >= deadline.getTime();
      const finalAttemptAnsweredAt = finalDraftFlushAfterDeadline
        ? finalizationNow
        : computeFinalExamEndedAt({
            now: finalizationNow,
            deadline,
            latestAnsweredAt: null,
          });
      let latestAnsweredAt: Date | null = null;
      const trackAnsweredAt = (answeredAt: Date | null) => {
        if (!answeredAt) return;
        if (
          latestAnsweredAt === null ||
          answeredAt.getTime() > latestAnsweredAt.getTime()
        ) {
          latestAnsweredAt = answeredAt;
        }
      };

      const draftedStates = activeSession.questionStates.filter(
        (state) => state.draftSelectedChoiceId !== null,
      );
      const questionsById = await fetchSessionOwnedQuestionsById(
        tx.questions,
        draftedStates.map((state) => state.questionId),
      );

      for (const state of activeSession.questionStates) {
        trackAnsweredAt(state.latestAnsweredAt);

        const timeSpentSeconds = Math.floor(
          clampDraftCumulativeMs(state.draftCumulativeMs) / MS_PER_SECOND,
        );
        const selectedChoiceId = state.draftSelectedChoiceId;
        if (selectedChoiceId === null) {
          if (state.latestSelectedChoiceId !== null) continue;

          const outcome = omittedOutcome();
          const attempt = await tx.attempts.insert({
            userId: input.userId,
            questionId: state.questionId,
            practiceSessionId: activeSession.id,
            outcome,
            isCorrect: false,
            timeSpentSeconds,
            answeredAt: finalAttemptAnsweredAt,
          });
          trackAnsweredAt(attempt.answeredAt);

          await tx.sessions.finalizeDraftAnswer({
            sessionId: input.sessionId,
            userId: input.userId,
            questionId: state.questionId,
            outcome,
            isCorrect: false,
            answeredAt: attempt.answeredAt,
          });
          continue;
        }

        const question = questionsById.get(state.questionId);
        if (!question) {
          throw new ApplicationError('NOT_FOUND', 'Question not found');
        }

        const grade = gradeAnswer(question, selectedChoiceId);
        const outcome = answeredOutcome(selectedChoiceId);
        const attempt = await tx.attempts.insert({
          userId: input.userId,
          questionId: state.questionId,
          practiceSessionId: activeSession.id,
          outcome,
          isCorrect: grade.isCorrect,
          timeSpentSeconds,
          answeredAt: finalAttemptAnsweredAt,
        });
        trackAnsweredAt(attempt.answeredAt);

        await tx.sessions.finalizeDraftAnswer({
          sessionId: input.sessionId,
          userId: input.userId,
          questionId: state.questionId,
          outcome,
          isCorrect: grade.isCorrect,
          answeredAt: attempt.answeredAt,
        });
      }

      const effectiveEndedAt = computeFinalExamEndedAt({
        now: finalizationNow,
        deadline,
        latestAnsweredAt,
      });
      return tx.sessions.end(input.sessionId, input.userId, effectiveEndedAt);
    }).catch(async (error: unknown) => {
      await this.throwAlreadyEndedForDoubleFinalizeLoser(input, error);
      throw error;
    });

    const endedAt = endedSession.endedAt;
    if (!endedAt) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Practice session did not end',
      );
    }

    return projectPracticeSessionSummary(endedSession, endedAt);
  }

  private async throwAlreadyEndedForDoubleFinalizeLoser(
    input: FinalizeExamAnswersInput,
    error: unknown,
  ): Promise<void> {
    if (!isAttemptAlreadyAnsweredConflict(error)) return;

    const freshSession = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!freshSession?.endedAt) return;

    throw practiceSessionAlreadyEndedError({ cause: error });
  }

  private async applyFinalDraftAnswer(
    tx: {
      questions: QuestionRepository;
      sessions: PracticeSessionRepository;
    },
    session: PracticeSession,
    finalDraftAnswer: FinalizeExamFinalDraftAnswer,
    now: Date,
  ): Promise<PracticeSession> {
    const questionState = session.questionStates.find(
      (state) => state.questionId === finalDraftAnswer.questionId,
    );
    if (!questionState) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Question is not part of this practice session',
      );
    }

    const deadline = computeExamDeadline(session);
    const nowMs = now.getTime();
    const isAfterGraceWindow =
      deadline !== null &&
      nowMs > deadline.getTime() + FINALIZE_FLUSH_DEADLINE_GRACE_MS;
    if (isAfterGraceWindow) {
      this.logger.warn(
        {
          sessionId: session.id,
          userId: session.userId,
          questionId: finalDraftAnswer.questionId,
        },
        'Dropped stale final exam draft flush after grace window',
      );
      return session;
    }

    const isWithinGraceWindow =
      deadline !== null &&
      nowMs >= deadline.getTime() &&
      nowMs <= deadline.getTime() + FINALIZE_FLUSH_DEADLINE_GRACE_MS;
    if (!isWithinGraceWindow) {
      throw new ApplicationError(
        'CONFLICT',
        'Final exam answer flush is only allowed at exam expiry',
      );
    }

    if (finalDraftAnswer.selectedChoiceId !== null) {
      const question = await tx.questions.findByIdForSession(
        finalDraftAnswer.questionId,
      );
      if (!question) {
        throw new ApplicationError('NOT_FOUND', 'Question not found');
      }
      const choiceBelongsToQuestion = question.choices.some(
        (choice) => choice.id === finalDraftAnswer.selectedChoiceId,
      );
      if (!choiceBelongsToQuestion) {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Selected choice does not belong to the question',
        );
      }
    }

    const clampedCumulativeMs = clampDraftCumulativeMs(
      finalDraftAnswer.cumulativeMs,
    );
    // saveDraftAnswer keeps draft state monotonic in cumulativeMs and drops a
    // write whose value is below the persisted draft. Floor the flush at the
    // existing (already-capped) draft time so a selection made at expiry is
    // never silently dropped, while preserving the BUG-238 upper bound.
    const persistedCumulativeMs = clampDraftCumulativeMs(
      questionState.draftCumulativeMs,
    );
    const cumulativeMs = Math.max(clampedCumulativeMs, persistedCumulativeMs);

    await tx.sessions.saveDraftAnswer({
      sessionId: session.id,
      userId: session.userId,
      questionId: finalDraftAnswer.questionId,
      selectedChoiceId: finalDraftAnswer.selectedChoiceId,
      cumulativeMs,
    });

    const refreshedSession = await tx.sessions.findByIdAndUserId(
      session.id,
      session.userId,
    );
    if (!refreshedSession) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    return refreshedSession;
  }
}
