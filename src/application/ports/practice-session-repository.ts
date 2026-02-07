import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';

export type CompletedPracticeSessionPage = {
  rows: readonly PracticeSession[];
  total: number;
};

export interface PracticeSessionRepository {
  findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<PracticeSession | null>;
  findLatestIncompleteByUserId(userId: string): Promise<PracticeSession | null>;
  findCompletedByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<CompletedPracticeSessionPage>;
  create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown; // adapter validates + persists exact shape
  }): Promise<PracticeSession>;
  recordQuestionAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSessionQuestionState>;
  setQuestionMarkedForReview(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    markedForReview: boolean;
  }): Promise<PracticeSessionQuestionState>;
  end(id: string, userId: string): Promise<PracticeSession>;
}
