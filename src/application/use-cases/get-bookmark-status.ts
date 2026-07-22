import type {
  GetBookmarkStatusInput,
  GetBookmarkStatusOutput,
} from '@/src/application/ports/bookmarks';
import type { BookmarkRepository } from '@/src/application/ports/repositories';

export type {
  GetBookmarkStatusInput,
  GetBookmarkStatusOutput,
} from '@/src/application/ports/bookmarks';

export class GetBookmarkStatusUseCase {
  constructor(private readonly bookmarks: BookmarkRepository) {}

  async execute(
    input: GetBookmarkStatusInput,
  ): Promise<GetBookmarkStatusOutput> {
    return {
      bookmarked: await this.bookmarks.exists(input.userId, input.questionId),
    };
  }
}
