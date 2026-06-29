import { ApplicationError } from '@/src/application/errors';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';

export type SetBookmarkInput = {
  userId: string;
  questionId: string;
  bookmarked: boolean;
};

export type SetBookmarkOutput = {
  bookmarked: boolean;
};

export class SetBookmarkUseCase {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly questions: QuestionRepository,
  ) {}

  async execute(input: SetBookmarkInput): Promise<SetBookmarkOutput> {
    if (!input.bookmarked) {
      await this.bookmarks.remove(input.userId, input.questionId);
      return { bookmarked: false };
    }

    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    await this.bookmarks.add(input.userId, input.questionId);
    return { bookmarked: true };
  }
}
