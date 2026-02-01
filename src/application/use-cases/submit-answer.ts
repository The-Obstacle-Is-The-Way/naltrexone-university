import {
  gradeAnswer,
  shouldShowExplanation as sessionShouldShowExplanation,
} from '@/src/domain/services';
import { ApplicationError } from '../errors';
import type {
  AttemptRepository,
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';

export type SubmitAnswerInput = {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
};

export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
};

export class SubmitAnswerUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptRepository,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const selected = question.choices.find((c) => c.id === input.choiceId);
    if (!selected) {
      throw new ApplicationError('NOT_FOUND', 'Choice not found');
    }

    const grade = gradeAnswer(question, input.choiceId);

    const attempt = await this.attempts.insert({
      userId: input.userId,
      questionId: question.id,
      practiceSessionId: input.sessionId ?? null,
      selectedChoiceId: input.choiceId,
      isCorrect: grade.isCorrect,
      timeSpentSeconds: 0,
    });

    let explanationMd: string | null = question.explanationMd;

    if (input.sessionId) {
      const session = await this.sessions.findByIdAndUserId(
        input.sessionId,
        input.userId,
      );
      if (!session) {
        throw new ApplicationError('NOT_FOUND', 'Practice session not found');
      }

      explanationMd = sessionShouldShowExplanation(session)
        ? question.explanationMd
        : null;
    }

    return {
      attemptId: attempt.id,
      isCorrect: grade.isCorrect,
      correctChoiceId: grade.correctChoiceId,
      explanationMd,
    };
  }
}
