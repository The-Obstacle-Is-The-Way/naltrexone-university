import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptAllQuestionsReader,
  AttemptedQuestionsFilters,
  AttemptedQuestionsResultFilter,
  AttemptedQuestionsSourceFilter,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import { fetchQuestionsById } from '@/src/application/shared/fetch-questions-by-id';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

export type GetAttemptedQuestionsInput = {
  userId: string;
  limit: number;
  offset: number;
  result?: AttemptedQuestionsResultFilter | null;
  source?: AttemptedQuestionsSourceFilter | null;
  difficulty?: QuestionDifficulty | null;
  tagSlug?: string | null;
};

export type AvailableAttemptedQuestionRow = {
  isAvailable: true;
  questionId: string;
  isCorrect: boolean;
  sessionId: string | null;
  sessionMode: 'tutor' | 'exam' | null;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  tagSlugs: string[];
  lastAnsweredAt: string; // ISO
};

export type UnavailableAttemptedQuestionRow = {
  isAvailable: false;
  questionId: string;
  isCorrect: boolean;
  sessionId: string | null;
  sessionMode: 'tutor' | 'exam' | null;
  lastAnsweredAt: string; // ISO
};

export type AttemptedQuestionRow =
  | AvailableAttemptedQuestionRow
  | UnavailableAttemptedQuestionRow;

export type GetAttemptedQuestionsOutput = {
  rows: AttemptedQuestionRow[];
  limit: number;
  offset: number;
  totalCount: number;
};

export class GetAttemptedQuestionsUseCase {
  constructor(
    private readonly attempts: AttemptAllQuestionsReader,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: GetAttemptedQuestionsInput,
  ): Promise<GetAttemptedQuestionsOutput> {
    const filters: AttemptedQuestionsFilters = {
      result: input.result ?? null,
      source: input.source ?? null,
      difficulty: input.difficulty ?? null,
      tagSlug: input.tagSlug ?? null,
    };

    const [totalCount, page] = await Promise.all([
      this.attempts.countAttemptedQuestionsByUserId(input.userId, filters),
      this.attempts.listAttemptedQuestionsByUserId(
        input.userId,
        input.limit,
        input.offset,
        filters,
      ),
    ]);

    if (totalCount === 0 || page.length === 0) {
      return {
        rows: [],
        limit: input.limit,
        offset: input.offset,
        totalCount,
      };
    }

    const byId = await fetchQuestionsById(
      this.questions,
      page.map((attempted) => attempted.questionId),
    );

    const rows = enrichWithQuestion({
      rows: page,
      getQuestionId: (attempted) => attempted.questionId,
      questionsById: byId,
      available: (attempted, question): AttemptedQuestionRow => ({
        isAvailable: true,
        questionId: question.id,
        isCorrect: attempted.isCorrect,
        sessionId: attempted.sessionId,
        sessionMode: attempted.sessionMode,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        tagSlugs: question.tags.map((tag) => tag.slug),
        lastAnsweredAt: attempted.answeredAt.toISOString(),
      }),
      unavailable: (attempted): AttemptedQuestionRow => ({
        isAvailable: false,
        questionId: attempted.questionId,
        isCorrect: attempted.isCorrect,
        sessionId: attempted.sessionId,
        sessionMode: attempted.sessionMode,
        lastAnsweredAt: attempted.answeredAt.toISOString(),
      }),
      logger: this.logger,
      missingQuestionMessage: 'Attempted question references missing question',
    });

    return {
      rows,
      limit: input.limit,
      offset: input.offset,
      totalCount,
    };
  }
}
