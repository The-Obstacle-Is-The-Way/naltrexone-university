import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptWriter,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { fetchQuestionsById } from '@/src/application/shared/fetch-questions-by-id';
import { gradeAnswer, MS_PER_SECOND } from '@/src/domain/services';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import {
  type PracticeSessionSummary,
  projectPracticeSessionSummary,
} from './practice-session-summary';
import { SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS } from './save-exam-draft-answer';

export type FinalizeExamAnswersInput = {
  userId: string;
  sessionId: string;
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
      const activeSession = await tx.sessions.findByIdAndUserId(
        input.sessionId,
        input.userId,
      );
      if (!activeSession) {
        throw new ApplicationError('NOT_FOUND', 'Practice session not found');
      }

      if (activeSession.mode !== 'exam') {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Finalize exam is only available in exam mode',
        );
      }

      if (activeSession.endedAt) {
        throw new ApplicationError(
          'CONFLICT',
          'Cannot finalize a completed session',
        );
      }

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
        if (!selectedChoiceId) {
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
}
