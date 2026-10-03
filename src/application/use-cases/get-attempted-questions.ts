import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptAllQuestionsReader,
  AttemptedQuestionsFilters,
  AttemptedQuestionsResultFilter,
  AttemptedQuestionsSort,
  AttemptedQuestionsSourceFilter,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import {
  bindingKey,
  fetchOwnedQuestionsByBinding,
} from '@/src/application/shared/fetch-questions-by-binding';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

export type GetAttemptedQuestionsInput = {
  userId: string;
  limit: number;
  offset: number;
  result?: AttemptedQuestionsResultFilter | null;
  source?: AttemptedQuestionsSourceFilter | null;
  difficulty?: QuestionDifficulty | null;
  tagSlug?: string | null;
  sort?: AttemptedQuestionsSort | null;
};

export type AvailableAttemptedQuestionRow = {
  isAvailable: true;
  /** Withdrawn since the learner attempted it (ADR-021 §3). */
  withdrawn: boolean;
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
      sort: input.sort ?? null,
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

    // ADR-021: each row shows the revision its latest attempt answered, and
    // stays listed once withdrawn, since the learner attempted it (§3). Its
    // content shows only if that attempt answered it (ADR-022 Decision 2).
    const byBinding = await fetchOwnedQuestionsByBinding(this.questions, page);
    const unavailable = (
      attempted: (typeof page)[number],
    ): AttemptedQuestionRow => ({
      isAvailable: false,
      questionId: attempted.questionId,
      isCorrect: attempted.isCorrect,
      sessionId: attempted.sessionId,
      sessionMode: attempted.sessionMode,
      lastAnsweredAt: attempted.answeredAt.toISOString(),
    });

    const rows = enrichWithQuestion({
      rows: page,
      getQuestionId: (attempted) => attempted.questionId,
      questionsById: byBinding,
      getLookupKey: bindingKey,
      available: (attempted, question): AttemptedQuestionRow =>
        question.status !== 'published' && attempted.isOmitted
          ? unavailable(attempted)
          : {
              isAvailable: true,
              withdrawn: question.status !== 'published',
              questionId: question.id,
              isCorrect: attempted.isCorrect,
              sessionId: attempted.sessionId,
              sessionMode: attempted.sessionMode,
              slug: question.slug,
              stemMd: question.stemMd,
              difficulty: question.difficulty,
              tagSlugs: question.tags.map((tag) => tag.slug),
              lastAnsweredAt: attempted.answeredAt.toISOString(),
            },
      unavailable,
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
