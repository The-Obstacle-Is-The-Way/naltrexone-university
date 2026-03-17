import { ApplicationError } from '../errors';
import type { PracticeSessionRepository } from '../ports/repositories';
import {
  type PracticeSessionSummary,
  projectPracticeSessionSummary,
} from './practice-session-summary';

export type GetPracticeSessionSummaryInput = {
  userId: string;
  sessionId: string;
};

export type GetPracticeSessionSummaryOutput = PracticeSessionSummary;

export class GetPracticeSessionSummaryUseCase {
  constructor(private readonly sessions: PracticeSessionRepository) {}

  async execute(
    input: GetPracticeSessionSummaryInput,
  ): Promise<GetPracticeSessionSummaryOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (!session.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session has not ended');
    }

    return projectPracticeSessionSummary(session, session.endedAt);
  }
}
