import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptWriter,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { fetchQuestionsById } from '@/src/application/shared/fetch-questions-by-id';
import { gradeAnswer } from '@/src/domain/services';
import {
  type PracticeSessionSummary,
  projectPracticeSessionSummary,
} from './practice-session-summary';

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

      for (const state of draftedStates) {
        const selectedChoiceId = state.draftSelectedChoiceId;
        if (!selectedChoiceId) continue;

        const question = questionsById.get(state.questionId);
        if (!question) {
          throw new ApplicationError('NOT_FOUND', 'Question not found');
        }

        const grade = gradeAnswer(question, selectedChoiceId);
        const attempt = await tx.attempts.insert({
          userId: input.userId,
          questionId: state.questionId,
          practiceSessionId: activeSession.id,
          selectedChoiceId,
          isCorrect: grade.isCorrect,
          timeSpentSeconds: Math.floor(state.draftCumulativeMs / 1000),
        });

        await tx.sessions.finalizeDraftAnswer({
          sessionId: input.sessionId,
          userId: input.userId,
          questionId: state.questionId,
          selectedChoiceId,
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
