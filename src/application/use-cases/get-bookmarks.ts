import type {
  BookmarkRow,
  GetBookmarksInput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';
import type { Logger } from '@/src/application/ports/logger';
import type { BookmarkRepository } from '@/src/application/ports/repositories';

export type {
  AvailableBookmarkRow,
  BookmarkRow,
  GetBookmarksInput,
  GetBookmarksOutput,
  UnavailableBookmarkRow,
} from '@/src/application/ports/bookmarks';

export class GetBookmarksUseCase {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: GetBookmarksInput): Promise<GetBookmarksOutput> {
    const summaries = await this.bookmarks.listSummariesByUserId(input.userId);
    for (const summary of summaries) {
      if (!summary.isAvailable) {
        this.logger.warn(
          { questionId: summary.questionId },
          'Bookmark references missing question',
        );
      }
    }
    const rows: BookmarkRow[] = summaries.map((summary) => ({
      ...summary,
      bookmarkedAt: summary.bookmarkedAt.toISOString(),
    }));

    return { rows };
  }
}
