import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';
import type { AnswerOutcome, PracticeMode } from '@/src/domain/value-objects';

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
    mode?: PracticeMode | null,
  ): Promise<CompletedPracticeSessionPage>;
  create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown; // adapter validates + persists exact shape
  }): Promise<PracticeSession>;
  saveDraftAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string;
    cumulativeMs: number;
  }): Promise<PracticeSessionQuestionState>;
  finalizeDraftAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    outcome: AnswerOutcome;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSessionQuestionState>;
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
