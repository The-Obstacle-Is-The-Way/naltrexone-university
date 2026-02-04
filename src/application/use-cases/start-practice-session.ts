import { createSeed, shuffleWithSeed } from '@/src/domain/services';
import type {
  PracticeMode,
  QuestionDifficulty,
} from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';

export type StartPracticeSessionInput = {
  userId: string;
  mode: PracticeMode;
  count: number;
  tagSlugs: string[];
  difficulties: QuestionDifficulty[];
};

export type StartPracticeSessionOutput = { sessionId: string };

export class StartPracticeSessionUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly sessions: PracticeSessionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: StartPracticeSessionInput,
  ): Promise<StartPracticeSessionOutput> {
    const candidateIds = await this.questions.listPublishedCandidateIds({
      tagSlugs: input.tagSlugs,
      difficulties: input.difficulties,
    });
    if (candidateIds.length === 0) {
      throw new ApplicationError('NOT_FOUND', 'No questions found');
    }

    const seed = createSeed(input.userId, this.now().getTime());
    const questionIds = shuffleWithSeed(candidateIds, seed).slice(
      0,
      input.count,
    );

    const session = await this.sessions.create({
      userId: input.userId,
      mode: input.mode,
      paramsJson: {
        count: questionIds.length,
        tagSlugs: input.tagSlugs,
        difficulties: input.difficulties,
        questionIds,
      },
    });

    return { sessionId: session.id };
  }
}
