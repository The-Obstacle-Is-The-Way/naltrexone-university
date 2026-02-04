import type { Logger } from '@/src/application/ports/logger';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

export type GetBookmarksInput = {
  userId: string;
};

export type AvailableBookmarkRow = {
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  bookmarkedAt: string; // ISO
};

export type UnavailableBookmarkRow = {
  isAvailable: false;
  questionId: string;
  bookmarkedAt: string; // ISO
};

export type BookmarkRow = AvailableBookmarkRow | UnavailableBookmarkRow;

export type GetBookmarksOutput = {
  rows: BookmarkRow[];
};

export class GetBookmarksUseCase {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: GetBookmarksInput): Promise<GetBookmarksOutput> {
    const bookmarks = await this.bookmarks.listByUserId(input.userId);

    if (bookmarks.length === 0) return { rows: [] };

    const questionIds = [...new Set(bookmarks.map((b) => b.questionId))];
    if (questionIds.length === 0) return { rows: [] };

    const questions = await this.questions.findPublishedByIds(questionIds);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const rows: BookmarkRow[] = [];
    for (const bookmark of bookmarks) {
      const question = byId.get(bookmark.questionId);
      if (!question) {
        // Graceful degradation: questions can be unpublished/deleted while bookmarks persist.
        this.logger.warn(
          { questionId: bookmark.questionId },
          'Bookmark references missing question',
        );
        rows.push({
          isAvailable: false,
          questionId: bookmark.questionId,
          bookmarkedAt: bookmark.createdAt.toISOString(),
        });
        continue;
      }

      rows.push({
        isAvailable: true,
        questionId: question.id,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        bookmarkedAt: bookmark.createdAt.toISOString(),
      });
    }

    return { rows };
  }
}
