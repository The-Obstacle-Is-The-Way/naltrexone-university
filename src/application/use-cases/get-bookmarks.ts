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
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import { fetchQuestionsById } from '@/src/application/shared/fetch-questions-by-id';

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
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: GetBookmarksInput): Promise<GetBookmarksOutput> {
    const bookmarks = await this.bookmarks.listByUserId(input.userId);

    if (bookmarks.length === 0) return { rows: [] };

    const questionsById = await fetchQuestionsById(
      this.questions,
      bookmarks.map((bookmark) => bookmark.questionId),
    );

    const rows = enrichWithQuestion({
      rows: bookmarks,
      getQuestionId: (bookmark) => bookmark.questionId,
      questionsById,
      available: (bookmark, question): BookmarkRow => ({
        isAvailable: true,
        questionId: question.id,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        bookmarkedAt: bookmark.createdAt.toISOString(),
      }),
      unavailable: (bookmark): BookmarkRow => ({
        isAvailable: false,
        questionId: bookmark.questionId,
        bookmarkedAt: bookmark.createdAt.toISOString(),
      }),
      logger: this.logger,
      missingQuestionMessage: 'Bookmark references missing question',
    });

    return { rows };
  }
}
