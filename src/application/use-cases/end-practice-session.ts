import {
  computeAccuracy,
  computeSessionDurationSeconds,
  computeSessionStats,
} from '@/src/domain/services';
import { ApplicationError } from '../errors';
import type { PracticeSessionRepository } from '../ports/repositories';

export type EndPracticeSessionInput = {
  userId: string;
  sessionId: string;
};

export type EndPracticeSessionOutput = {
  sessionId: string;
  endedAt: string; // ISO
  totals: {
    answered: number;
    correct: number;
    accuracy: number; // 0..1
    durationSeconds: number;
  };
};

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

    const { answered, correct } = computeSessionStats(session.questionStates);
    const accuracy = computeAccuracy(answered, correct);

    const durationSeconds = computeSessionDurationSeconds(
      session.startedAt,
      endedAt,
    );

    return {
      sessionId: session.id,
      endedAt: endedAt.toISOString(),
      totals: {
        answered,
        correct,
        accuracy,
        durationSeconds,
      },
    };
  }
}
