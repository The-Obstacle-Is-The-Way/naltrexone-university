import type {
  GetBookmarkQuestionIdsInput,
  GetBookmarkQuestionIdsOutput,
} from '@/src/application/ports/bookmarks';
import type { BookmarkRepository } from '@/src/application/ports/repositories';

export type {
  GetBookmarkQuestionIdsInput,
  GetBookmarkQuestionIdsOutput,
} from '@/src/application/ports/bookmarks';

export class GetBookmarkQuestionIdsUseCase {
  constructor(private readonly bookmarks: BookmarkRepository) {}

  async execute(
    input: GetBookmarkQuestionIdsInput,
  ): Promise<GetBookmarkQuestionIdsOutput> {
    const questionIds = await this.bookmarks.listQuestionIdsByUserId(
      input.userId,
    );
    return { questionIds: [...questionIds] };
  }
}
