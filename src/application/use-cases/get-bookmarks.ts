import type {
  BookmarkRow,
  GetBookmarksInput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';
import type { Logger } from '@/src/application/ports/logger';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';

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
    private readonly questions: Pick<
      QuestionRepository,
      'findAvailabilityByIds'
    >,
    private readonly logger: Logger,
  ) {}

  async execute(input: GetBookmarksInput): Promise<GetBookmarksOutput> {
    const summaries = await this.bookmarks.listSummariesByUserId(input.userId);
    // ADR-022 Decision 1: a question no longer available is named by its
    // state. A bookmark binds no revision, so the state is read by id.
    const availabilityById = await this.questions.findAvailabilityByIds(
      summaries
        .filter((summary) => !summary.isAvailable)
        .map((summary) => summary.questionId),
    );
    const rows: BookmarkRow[] = summaries.map((summary) => {
      const bookmarkedAt = summary.bookmarkedAt.toISOString();
      if (summary.isAvailable) return { ...summary, bookmarkedAt };

      const availability = availabilityById.get(summary.questionId);
      if (!availability) {
        this.logger.warn(
          { questionId: summary.questionId },
          'Bookmark references a missing question',
        );
      }
      return {
        ...summary,
        // Published again since the bookmark was read: no label to give.
        availability:
          availability && availability !== 'available' ? availability : null,
        bookmarkedAt,
      };
    });

    return { rows };
  }
}
