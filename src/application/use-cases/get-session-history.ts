import {
  computeAccuracy,
  computeSessionDurationSeconds,
  computeSessionStats,
} from '@/src/domain/services';
import type { PracticeMode } from '@/src/domain/value-objects';
import type { PracticeSessionRepository } from '../ports/repositories';

export type GetSessionHistoryInput = {
  userId: string;
  limit: number;
  offset: number;
};

export type SessionHistoryRow = {
  sessionId: string;
  mode: PracticeMode;
  questionCount: number;
  answered: number;
  correct: number;
  accuracy: number;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
};

export type GetSessionHistoryOutput = {
  rows: SessionHistoryRow[];
  total: number;
  limit: number;
  offset: number;
};

export class GetSessionHistoryUseCase {
  constructor(private readonly sessions: PracticeSessionRepository) {}

  async execute(
    input: GetSessionHistoryInput,
  ): Promise<GetSessionHistoryOutput> {
    const page = await this.sessions.findCompletedByUserId(
      input.userId,
      input.limit,
      input.offset,
    );

    const rows: SessionHistoryRow[] = [];
    for (const session of page.rows) {
      const endedAt = session.endedAt;
      if (!endedAt) continue;

      const { answered, correct } = computeSessionStats(session.questionStates);

      rows.push({
        sessionId: session.id,
        mode: session.mode,
        questionCount: session.questionIds.length,
        answered,
        correct,
        accuracy: computeAccuracy(answered, correct),
        durationSeconds: computeSessionDurationSeconds(
          session.startedAt,
          endedAt,
        ),
        startedAt: session.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      });
    }

    return {
      rows,
      total: page.total,
      limit: input.limit,
      offset: input.offset,
    };
  }
}
