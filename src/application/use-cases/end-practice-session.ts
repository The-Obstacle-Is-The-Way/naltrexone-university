import { ApplicationError } from '../errors';
import type { PracticeSessionRepository } from '../ports/repositories';
import {
  type PracticeSessionSummary,
  projectPracticeSessionSummary,
} from './practice-session-summary';

export type EndPracticeSessionInput = {
  userId: string;
  sessionId: string;
};

export type EndPracticeSessionOutput = PracticeSessionSummary;

export class EndPracticeSessionUseCase {
  constructor(private readonly sessions: PracticeSessionRepository) {}

  async execute(
    input: EndPracticeSessionInput,
  ): Promise<EndPracticeSessionOutput> {
    const session = await this.sessions.end(input.sessionId, input.userId);

    const endedAt = session.endedAt;
    if (!endedAt) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Practice session did not end',
      );
    }

    return projectPracticeSessionSummary(session, endedAt);
  }
}
