import {
  gradeAnswer,
  shouldShowExplanation as sessionShouldShowExplanation,
} from '@/src/domain/services';
import { ApplicationError } from '../errors';
import type {
  AttemptWriter,
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';

export type SubmitAnswerInput = {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
  timeSpentSeconds?: number;
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
    private readonly attempts: AttemptWriter,
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

    const session = input.sessionId
      ? await this.sessions.findByIdAndUserId(input.sessionId, input.userId)
      : null;

    if (input.sessionId && !session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    const rawTimeSpentSeconds = input.timeSpentSeconds;
    const timeSpentSeconds =
      typeof rawTimeSpentSeconds === 'number' &&
      Number.isFinite(rawTimeSpentSeconds)
        ? Math.max(0, rawTimeSpentSeconds)
        : 0;

    const attempt = await this.attempts.insert({
      userId: input.userId,
      questionId: question.id,
      practiceSessionId: session ? session.id : null,
      selectedChoiceId: input.choiceId,
      isCorrect: grade.isCorrect,
      timeSpentSeconds,
    });

    const explanationMd =
      session && !sessionShouldShowExplanation(session)
        ? null
        : question.explanationMd;

    return {
      attemptId: attempt.id,
      isCorrect: grade.isCorrect,
      correctChoiceId: grade.correctChoiceId,
      explanationMd,
    };
  }
}
