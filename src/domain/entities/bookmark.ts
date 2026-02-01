/**
 * Bookmark entity - user's saved question.
 */
export type Bookmark = {
  readonly userId: string;
  readonly questionId: string;
  readonly createdAt: Date;
};
