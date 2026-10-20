import { ApplicationError } from '@/src/application/errors';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import {
  getPracticeSessionTimingSnapshot,
  type PracticeSessionTimingSnapshot,
} from '@/src/application/shared/practice-session-timing';

export type GetPracticeSessionTimingInput = {
  userId: string;
  sessionId: string;
};

export type GetPracticeSessionTimingOutput = PracticeSessionTimingSnapshot;

export class GetPracticeSessionTimingUseCase {
  constructor(
    private readonly sessions: Pick<
      PracticeSessionRepository,
      'findByIdAndUserId'
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: GetPracticeSessionTimingInput,
  ): Promise<GetPracticeSessionTimingOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    return getPracticeSessionTimingSnapshot(session, this.now());
  }
}
