import {
  computeAccuracy,
  computeSessionDurationSeconds,
  computeSessionStats,
} from '@/src/domain/services';
import type { PracticeMode } from '@/src/domain/value-objects';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';

export type GetSessionHistoryInput = {
  userId: string;
  limit: number;
  offset: number;
};

export type SessionHistoryRow = {
  sessionId: string;
  mode: PracticeMode;
  questionCount: number;
  firstQuestionSlug: string | null;
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
  constructor(
    private readonly sessions: PracticeSessionRepository,
    private readonly questions: QuestionRepository,
  ) {}

  async execute(
    input: GetSessionHistoryInput,
  ): Promise<GetSessionHistoryOutput> {
    const page = await this.sessions.findCompletedByUserId(
      input.userId,
      input.limit,
      input.offset,
    );

    const firstQuestionIds = Array.from(
      new Set(
        page.rows
          .map((session) => session.questionIds[0])
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
    const firstQuestionSlugById = new Map<string, string>();
    if (firstQuestionIds.length > 0) {
      const questions =
        await this.questions.findPublishedByIds(firstQuestionIds);
      for (const question of questions) {
        firstQuestionSlugById.set(question.id, question.slug);
      }
    }

    const rows: SessionHistoryRow[] = [];
    let skippedCount = 0;
    for (const session of page.rows) {
      const endedAt = session.endedAt;
      if (!endedAt) {
        skippedCount += 1;
        continue;
      }

      const { answered, correct } = computeSessionStats(session.questionStates);
      const questionCount = session.questionIds.length;
      const accuracyDenominator = questionCount;

      rows.push({
        sessionId: session.id,
        mode: session.mode,
        questionCount,
        firstQuestionSlug:
          firstQuestionSlugById.get(session.questionIds[0] ?? '') ?? null,
        answered,
        correct,
        accuracy: computeAccuracy(accuracyDenominator, correct),
        durationSeconds: computeSessionDurationSeconds(
          session.startedAt,
          endedAt,
        ),
        startedAt: session.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      });
    }

    const total = Math.max(0, page.total - skippedCount);
    return {
      rows,
      total,
      limit: input.limit,
      offset: input.offset,
    };
  }
}
