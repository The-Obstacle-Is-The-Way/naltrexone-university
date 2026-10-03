import {
  computeAccuracy,
  computeSessionDurationSeconds,
} from '@/src/domain/services';
import type { PracticeMode } from '@/src/domain/value-objects';
import type { PracticeSessionRepository } from '../ports/repositories';

export type GetSessionHistoryInput = {
  userId: string;
  limit: number;
  offset: number;
  mode?: PracticeMode | null;
};

export type SessionHistoryRow = {
  sessionId: string;
  mode: PracticeMode;
  questionCount: number;
  firstQuestionSlug: string | null;
  answered: number;
  /**
   * The items that count toward the score: the learner had a fair chance at
   * them and their content is not now in doubt (ADR-022 Decision 3, as
   * amended by DEBT-494).
   */
  scored: number;
  /** The scored items answered correctly. */
  correct: number;
  /** `correct / scored`; 0 when nothing is scored. */
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
    const page = await this.sessions.findCompletedHistorySummariesByUserId(
      input.userId,
      input.limit,
      input.offset,
      input.mode ?? null,
    );

    const rows: SessionHistoryRow[] = [];
    for (const session of page.rows) {
      rows.push({
        sessionId: session.sessionId,
        mode: session.mode,
        questionCount: session.questionCount,
        firstQuestionSlug: session.firstQuestionSlug,
        answered: session.answered,
        scored: session.scored,
        correct: session.scoredCorrect,
        accuracy: computeAccuracy(session.scored, session.scoredCorrect),
        durationSeconds: computeSessionDurationSeconds(
          session.startedAt,
          session.endedAt,
        ),
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
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
