import { computeAccuracy } from '@/src/domain/services';
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

    const answeredStates = session.questionStates.filter(
      (state) => state.latestSelectedChoiceId !== null,
    );
    const answered = answeredStates.length;
    const correct = answeredStates.filter(
      (state) => state.latestIsCorrect === true,
    ).length;
    const accuracy = computeAccuracy(answered, correct);

    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
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
