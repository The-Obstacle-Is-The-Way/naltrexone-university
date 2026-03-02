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
  mode?: PracticeMode | null;
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
      input.mode ?? null,
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
      const publishedQuestions =
        await this.questions.findPublishedByIds(firstQuestionIds);
      for (const q of publishedQuestions) {
        firstQuestionSlugById.set(q.id, q.slug);
      }
    }

    const rows: SessionHistoryRow[] = [];
    for (const session of page.rows) {
      const endedAt = session.endedAt;
      if (!endedAt) {
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

    return {
      rows,
      total: page.total,
      limit: input.limit,
      offset: input.offset,
    };
  }
}
