import type { PracticeSessionRepository } from '../ports/repositories';

export type DiscardPracticeSessionInput = {
  userId: string;
  sessionId: string;
};

export type DiscardPracticeSessionOutput = {
  discarded: true;
};

export class DiscardPracticeSessionUseCase {
  constructor(private readonly sessions: PracticeSessionRepository) {}

  async execute(
    input: DiscardPracticeSessionInput,
  ): Promise<DiscardPracticeSessionOutput> {
    await this.sessions.discard(input.sessionId, input.userId);
    return { discarded: true };
  }
}
