import type { Attempt } from '@/src/domain/entities';
import type {
  PracticeMode,
  QuestionDifficulty,
} from '@/src/domain/value-objects';

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

export type AttemptedQuestionSummary = {
  questionId: string;
  answeredAt: Date;
  isCorrect: boolean;
  sessionId: string | null;
  sessionMode: PracticeMode | null;
};

export type AttemptedQuestionsResultFilter = 'correct' | 'incorrect';
export type AttemptedQuestionsSourceFilter = 'tutor' | 'exam' | 'adhoc';

export type AttemptedQuestionsFilters = {
  result?: AttemptedQuestionsResultFilter | null;
  source?: AttemptedQuestionsSourceFilter | null;
  difficulty?: QuestionDifficulty | null;
  tagSlug?: string | null;
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

export interface AttemptAllQuestionsReader {
  /**
   * Paginated attempted question summaries based on the user's most recent
   * attempt per question (all questions, not just incorrect).
   */
  listAttemptedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
    filters?: AttemptedQuestionsFilters,
  ): Promise<readonly AttemptedQuestionSummary[]>;

  /**
   * Total count of unique questions the user has attempted at least once.
   */
  countAttemptedQuestionsByUserId(
    userId: string,
    filters?: AttemptedQuestionsFilters,
  ): Promise<number>;
}

export interface AttemptSingleQuestionReader {
  /**
   * Return the user's most recent attempt for a specific question.
   * Used by review mode to reconstruct the post-submit state.
   */
  findLatestByUserAndQuestion(
    userId: string,
    questionId: string,
  ): Promise<Attempt | null>;

  /**
   * Return a specific attempt by id, scoped to the given user.
   * Used by dashboard review mode when an attemptId is provided in the URL.
   */
  findByIdAndUserId(attemptId: string, userId: string): Promise<Attempt | null>;

  /**
   * Return the attempt for a given session + question, scoped to the given user.
   * Used by session review navigation to ensure the attempt is from that session.
   */
  findBySessionIdAndQuestionId(
    sessionId: string,
    userId: string,
    questionId: string,
  ): Promise<Attempt | null>;
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
    AttemptAllQuestionsReader,
    AttemptSingleQuestionReader,
    AttemptMostRecentAnsweredAtReader {}
