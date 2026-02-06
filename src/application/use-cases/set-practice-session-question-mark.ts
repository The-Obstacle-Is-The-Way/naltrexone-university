import { ApplicationError } from '../errors';
import type { PracticeSessionRepository } from '../ports/repositories';

export type SetPracticeSessionQuestionMarkInput = {
  userId: string;
  sessionId: string;
  questionId: string;
  markedForReview: boolean;
};

export type SetPracticeSessionQuestionMarkOutput = {
  questionId: string;
  markedForReview: boolean;
};

export class SetPracticeSessionQuestionMarkUseCase {
  constructor(private readonly sessions: PracticeSessionRepository) {}

  async execute(
    input: SetPracticeSessionQuestionMarkInput,
  ): Promise<SetPracticeSessionQuestionMarkOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (session.mode !== 'exam') {
      throw new ApplicationError(
        'CONFLICT',
        'Mark for review is only available in exam mode',
      );
    }

    const state = await this.sessions.setQuestionMarkedForReview({
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      markedForReview: input.markedForReview,
    });

    return {
      questionId: state.questionId,
      markedForReview: state.markedForReview,
    };
  }
}
