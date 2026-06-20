import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptWriter,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { fetchQuestionsById } from '@/src/application/shared/fetch-questions-by-id';
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
 * only from the deadline up to this short window after it, covering that delay
 * without enabling arbitrary-late answering.
 */
export const FINALIZE_FLUSH_DEADLINE_GRACE_MS = 30_000;

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

export class FinalizeExamAnswersUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptWriter,
    private readonly sessions: PracticeSessionRepository,
    private readonly writeTransaction: FinalizeExamAnswersWriteTransaction,
    private readonly now: () => Date = () => new Date(),
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
          )
        : loadedSession;

      const draftedStates = activeSession.questionStates.filter(
        (state) => state.draftSelectedChoiceId !== null,
      );
      const questionsById = await fetchQuestionsById(
        tx.questions,
        draftedStates.map((state) => state.questionId),
      );

      for (const state of activeSession.questionStates) {
        const cappedCumulativeMs = Math.min(
          state.draftCumulativeMs,
          SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
        );
        const timeSpentSeconds = Math.floor(cappedCumulativeMs / MS_PER_SECOND);
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
          });

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
        });

        await tx.sessions.finalizeDraftAnswer({
          sessionId: input.sessionId,
          userId: input.userId,
          questionId: state.questionId,
          outcome,
          isCorrect: grade.isCorrect,
          answeredAt: attempt.answeredAt,
        });
      }

      return tx.sessions.end(input.sessionId, input.userId);
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

  private async applyFinalDraftAnswer(
    tx: {
      questions: QuestionRepository;
      sessions: PracticeSessionRepository;
    },
    session: PracticeSession,
    finalDraftAnswer: FinalizeExamFinalDraftAnswer,
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
    const nowMs = this.now().getTime();
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
      const question = await tx.questions.findPublishedById(
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

    const rawCumulativeMs = finalDraftAnswer.cumulativeMs;
    const clampedCumulativeMs =
      typeof rawCumulativeMs === 'number' && Number.isFinite(rawCumulativeMs)
        ? Math.min(
            SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
            Math.max(0, rawCumulativeMs),
          )
        : 0;
    // saveDraftAnswer keeps draft state monotonic in cumulativeMs and drops a
    // write whose value is below the persisted draft. Floor the flush at the
    // existing (already-capped) draft time so a selection made at expiry is
    // never silently dropped, while preserving the BUG-238 upper bound.
    const persistedCumulativeMs = Math.min(
      questionState.draftCumulativeMs,
      SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
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
