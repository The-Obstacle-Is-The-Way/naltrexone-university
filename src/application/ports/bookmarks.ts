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
