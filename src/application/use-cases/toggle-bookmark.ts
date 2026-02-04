import { ApplicationError } from '@/src/application/errors';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';

export type ToggleBookmarkInput = {
  userId: string;
  questionId: string;
};

export type ToggleBookmarkOutput = {
  bookmarked: boolean;
};

export class ToggleBookmarkUseCase {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly questions: QuestionRepository,
  ) {}

  async execute(input: ToggleBookmarkInput): Promise<ToggleBookmarkOutput> {
    const wasRemoved = await this.bookmarks.remove(
      input.userId,
      input.questionId,
    );
    if (wasRemoved) return { bookmarked: false };

    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    await this.bookmarks.add(input.userId, input.questionId);
    return { bookmarked: true };
  }
}
