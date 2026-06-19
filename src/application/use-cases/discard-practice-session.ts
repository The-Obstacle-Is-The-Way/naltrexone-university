import { ApplicationError } from '../errors';
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
    const existing = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );

    // Idempotent: an absent (already-discarded, or not-owned) session is a no-op success.
    if (!existing) {
      return { discarded: true };
    }

    // Discard is the exam-only terminal transition. Tutor sessions hold real graded
    // attempts and must complete via end(), never be deleted (BUG-251 decision). Enforce
    // the invariant server-side so a direct action call cannot bypass the UI's mode routing.
    if (existing.mode !== 'exam') {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Only exam sessions can be discarded; tutor sessions must be ended',
      );
    }

    await this.sessions.discard(input.sessionId, input.userId);
    return { discarded: true };
  }
}
