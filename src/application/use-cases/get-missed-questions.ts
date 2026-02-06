import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptMissedQuestionsReader,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { QuestionDifficulty } from '@/src/domain/value-objects';
import { enrichWithQuestion } from '../shared/enrich-with-question';

export type GetMissedQuestionsInput = {
  userId: string;
  limit: number;
  offset: number;
};

export type AvailableMissedQuestionRow = {
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  lastAnsweredAt: string; // ISO
};

export type UnavailableMissedQuestionRow = {
  isAvailable: false;
  questionId: string;
  lastAnsweredAt: string; // ISO
};

export type MissedQuestionRow =
  | AvailableMissedQuestionRow
  | UnavailableMissedQuestionRow;

export type GetMissedQuestionsOutput = {
  rows: MissedQuestionRow[];
  limit: number;
  offset: number;
  totalCount: number;
};

export class GetMissedQuestionsUseCase {
  constructor(
    private readonly attempts: AttemptMissedQuestionsReader,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: GetMissedQuestionsInput,
  ): Promise<GetMissedQuestionsOutput> {
    const [totalCount, page] = await Promise.all([
      this.attempts.countMissedQuestionsByUserId(input.userId),
      this.attempts.listMissedQuestionsByUserId(
        input.userId,
        input.limit,
        input.offset,
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

    const questionIds = page.map((m) => m.questionId);
    const questions = await this.questions.findPublishedByIds(questionIds);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const rows = enrichWithQuestion({
      rows: page,
      getQuestionId: (missed) => missed.questionId,
      questionsById: byId,
      available: (missed, question): MissedQuestionRow => ({
        isAvailable: true,
        questionId: question.id,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        lastAnsweredAt: missed.answeredAt.toISOString(),
      }),
      unavailable: (missed): MissedQuestionRow => ({
        isAvailable: false,
        questionId: missed.questionId,
        lastAnsweredAt: missed.answeredAt.toISOString(),
      }),
      logger: this.logger,
      missingQuestionMessage: 'Missed question references missing question',
    });

    return {
      rows,
      limit: input.limit,
      offset: input.offset,
      totalCount,
    };
  }
}
