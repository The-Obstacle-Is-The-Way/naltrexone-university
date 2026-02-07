import type { Attempt } from '@/src/domain/entities';
import type { PracticeMode } from '@/src/domain/value-objects';

export type PageOptions = {
  limit: number;
  offset: number;
};

export type AttemptInsertInput = {
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
};

export type AttemptMostRecentAnsweredAt = {
  questionId: string;
  answeredAt: Date;
};

export type MissedQuestionAttempt = {
  questionId: string;
  answeredAt: Date;
  sessionId: string | null;
  sessionMode: PracticeMode | null;
};

export type RecentAttempt = Attempt & {
  sessionMode: PracticeMode | null;
};

export interface AttemptWriter {
  insert(input: AttemptInsertInput): Promise<Attempt>;
  deleteById(id: string, userId: string): Promise<boolean>;
}

export interface AttemptHistoryReader {
  findByUserId(userId: string, page: PageOptions): Promise<readonly Attempt[]>;
}

export interface AttemptSessionReader {
  findBySessionId(
    sessionId: string,
    userId: string,
  ): Promise<readonly Attempt[]>;
}

export interface AttemptStatsReader {
  countByUserId(userId: string): Promise<number>;
  countCorrectByUserId(userId: string): Promise<number>;

  countByUserIdSince(userId: string, since: Date): Promise<number>;
  countCorrectByUserIdSince(userId: string, since: Date): Promise<number>;

  listRecentByUserId(
    userId: string,
    limit: number,
  ): Promise<readonly RecentAttempt[]>;

  /**
   * Return answeredAt timestamps for attempts within a date range.
   * Intended for streak computation; repository may return a subset of columns.
   */
  listAnsweredAtByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<readonly Date[]>;
}

export interface AttemptMissedQuestionsReader {
  /**
   * Paginated missed question IDs based on the user's most recent attempt
   * per question (only included when the most recent attempt is incorrect).
   */
  listMissedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<readonly MissedQuestionAttempt[]>;

  /**
   * Total missed question count based on the user's most recent attempt per question.
   */
  countMissedQuestionsByUserId(userId: string): Promise<number>;
}

export interface AttemptMostRecentAnsweredAtReader {
  /**
   * For each question id, return the most recent answeredAt (max) for this user.
   * Missing entries imply "never attempted".
   */
  findMostRecentAnsweredAtByQuestionIds(
    userId: string,
    questionIds: readonly string[],
  ): Promise<readonly AttemptMostRecentAnsweredAt[]>;
}

export interface AttemptRepository
  extends AttemptWriter,
    AttemptHistoryReader,
    AttemptSessionReader,
    AttemptStatsReader,
    AttemptMissedQuestionsReader,
    AttemptMostRecentAnsweredAtReader {}
