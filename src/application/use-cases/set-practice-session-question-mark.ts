import {
  ApplicationError,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import { getPracticeSessionTiming } from '@/src/domain/services';

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
  constructor(
    private readonly sessions: PracticeSessionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

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

    const timing = getPracticeSessionTiming(session, this.now());
    if (timing.state === 'ended') {
      throw new ApplicationError(
        'CONFLICT',
        'Cannot modify a completed session',
      );
    }

    if (timing.state === 'expired') {
      throw new ApplicationError(
        'CONFLICT',
        'Exam time has expired',
        undefined,
        {
          details: { reason: PracticeSessionConflictReasons.ExamTimeExpired },
        },
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
