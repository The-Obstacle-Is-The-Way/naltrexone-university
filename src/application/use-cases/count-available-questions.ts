import type { QuestionRepository } from '@/src/application/ports/repositories';
import type {
  QuestionDifficulty,
  QuestionProgressStatus,
} from '@/src/domain/value-objects';

export type CountAvailableQuestionsInput = {
  userId: string;
  tagSlugs: string[];
  difficulties: QuestionDifficulty[];
  statuses: QuestionProgressStatus[];
};

export type CountAvailableQuestionsOutput = {
  count: number;
};

export class CountAvailableQuestionsUseCase {
  constructor(private readonly questions: QuestionRepository) {}

  async execute(
    input: CountAvailableQuestionsInput,
  ): Promise<CountAvailableQuestionsOutput> {
    const count = await this.questions.countPublishedCandidateIds({
      userId: input.userId,
      tagSlugs: input.tagSlugs,
      difficulties: input.difficulties,
      statuses: input.statuses,
    });

    return { count };
  }
}
