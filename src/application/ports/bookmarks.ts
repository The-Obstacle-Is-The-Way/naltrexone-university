import type {
  QuestionDifficulty,
  UnavailableQuestionAvailability,
} from '@/src/domain/value-objects';

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
  /**
   * The question's state, for its label (ADR-022 Decision 1), or null when
   * the question no longer exists. No content is shown (Decision 2).
   */
  availability: UnavailableQuestionAvailability | null;
  questionId: string;
  bookmarkedAt: string; // ISO
};

export type BookmarkRow = AvailableBookmarkRow | UnavailableBookmarkRow;

export type GetBookmarksOutput = {
  rows: BookmarkRow[];
};

export type GetBookmarkQuestionIdsInput = {
  userId: string;
};

export type GetBookmarkQuestionIdsOutput = {
  questionIds: string[];
};

export type GetBookmarkStatusInput = {
  userId: string;
  questionId: string;
};

export type GetBookmarkStatusOutput = {
  bookmarked: boolean;
};
