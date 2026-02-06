import type { PracticeSessionRepository } from '@/src/application/ports/repositories';

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
  constructor(private readonly sessions: PracticeSessionRepository) {}

  async execute(
    input: GetIncompletePracticeSessionInput,
  ): Promise<GetIncompletePracticeSessionOutput> {
    const session = await this.sessions.findLatestIncompleteByUserId(
      input.userId,
    );
    if (!session) return null;

    const answeredCount = session.questionStates.filter(
      (state) => state.latestSelectedChoiceId !== null,
    ).length;

    return {
      sessionId: session.id,
      mode: session.mode,
      answeredCount,
      totalCount: session.questionIds.length,
      startedAt: session.startedAt.toISOString(),
    };
  }
}
