import { computeSessionProgress } from '@/src/domain/services';
import type {
  AttemptSessionReader,
  PracticeSessionRepository,
} from '../ports/repositories';

export type GetIncompletePracticeSessionInput = {
  userId: string;
};

export type GetIncompletePracticeSessionOutput = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  answeredCount: number;
  totalCount: number;
  startedAt: string;
} | null;

export class GetIncompletePracticeSessionUseCase {
  constructor(
    private readonly sessions: PracticeSessionRepository,
    private readonly attempts: AttemptSessionReader,
  ) {}

  async execute(
    input: GetIncompletePracticeSessionInput,
  ): Promise<GetIncompletePracticeSessionOutput> {
    const session = await this.sessions.findLatestIncompleteByUserId(
      input.userId,
    );
    if (!session) return null;

    const attempts = await this.attempts.findBySessionId(
      session.id,
      input.userId,
    );
    const sessionQuestionIds = new Set(session.questionIds);
    const answeredCount = new Set(
      attempts
        .map((attempt) => attempt.questionId)
        .filter((questionId) => sessionQuestionIds.has(questionId)),
    ).size;
    const progress = computeSessionProgress(session, answeredCount);

    return {
      sessionId: session.id,
      mode: session.mode,
      answeredCount: progress.current,
      totalCount: progress.total,
      startedAt: session.startedAt.toISOString(),
    };
  }
}
