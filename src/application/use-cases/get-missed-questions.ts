import type { Logger } from '@/src/application/ports/logger';
import type { QuestionDifficulty } from '@/src/domain/value-objects';
import type {
  AttemptMissedQuestionsReader,
  QuestionRepository,
} from '../ports/repositories';

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
    const page = await this.attempts.listMissedQuestionsByUserId(
      input.userId,
      input.limit,
      input.offset,
    );

    if (page.length === 0) {
      return { rows: [], limit: input.limit, offset: input.offset };
    }

    const questionIds = page.map((m) => m.questionId);
    const questions = await this.questions.findPublishedByIds(questionIds);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const rows: MissedQuestionRow[] = [];
    for (const m of page) {
      const question = byId.get(m.questionId);
      if (!question) {
        // Graceful degradation: questions can be unpublished/deleted while attempts persist.
        this.logger.warn(
          { questionId: m.questionId },
          'Missed question references missing question',
        );
        rows.push({
          isAvailable: false,
          questionId: m.questionId,
          lastAnsweredAt: m.answeredAt.toISOString(),
        });
        continue;
      }

      rows.push({
        isAvailable: true,
        questionId: question.id,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        lastAnsweredAt: m.answeredAt.toISOString(),
      });
    }

    return {
      rows,
      limit: input.limit,
      offset: input.offset,
    };
  }
}
