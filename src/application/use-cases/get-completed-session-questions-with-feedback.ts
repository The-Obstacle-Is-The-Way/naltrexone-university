import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptSessionReader,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import { fetchQuestionsById } from '@/src/application/shared/fetch-questions-by-id';
import {
  buildShuffledChoiceViews,
  type ChoiceExplanation,
} from '@/src/application/shared/shuffled-choice-views';
import {
  isOmittedOutcome,
  selectedChoiceIdOrNull,
} from '@/src/domain/value-objects';

export type CompletedSessionQuestionChoice = {
  id: string;
  label: string;
  textMd: string;
};

export type AvailableCompletedSessionQuestionWithFeedbackRow = {
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
  choices: CompletedSessionQuestionChoice[];
  selectedChoiceId: string | null;
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[];
};

export type UnavailableCompletedSessionQuestionWithFeedbackRow = {
  isAvailable: false;
  questionId: string;
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
};

export type CompletedSessionQuestionWithFeedbackRow =
  | AvailableCompletedSessionQuestionWithFeedbackRow
  | UnavailableCompletedSessionQuestionWithFeedbackRow;

export type GetCompletedSessionQuestionsWithFeedbackInput = {
  userId: string;
  sessionId: string;
};

export type GetCompletedSessionQuestionsWithFeedbackOutput = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  totalCount: number;
  answeredCount: number;
  markedCount: number;
  rows: CompletedSessionQuestionWithFeedbackRow[];
};

type ReviewSeed = {
  questionId: string;
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
  selectedChoiceId: string | null;
};

export class GetCompletedSessionQuestionsWithFeedbackUseCase {
  constructor(
    private readonly sessions: PracticeSessionRepository,
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptSessionReader,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: GetCompletedSessionQuestionsWithFeedbackInput,
  ): Promise<GetCompletedSessionQuestionsWithFeedbackOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    if (session.endedAt === null) {
      throw new ApplicationError(
        'CONFLICT',
        'Practice session must be completed before feedback can be loaded',
      );
    }

    const questionById = await fetchQuestionsById(
      this.questions,
      session.questionIds,
    );
    const attempts = await this.attempts.findBySessionId(
      input.sessionId,
      input.userId,
    );
    const attemptByQuestionId = new Map(
      attempts.map((attempt) => [attempt.questionId, attempt]),
    );
    const stateByQuestionId = new Map(
      session.questionStates.map((state) => [state.questionId, state]),
    );

    let answeredCount = 0;
    const reviewSeeds: ReviewSeed[] = [];
    for (let i = 0; i < session.questionIds.length; i += 1) {
      const questionId = session.questionIds[i];
      if (!questionId) continue;

      const state = stateByQuestionId.get(questionId);
      if (!state) {
        this.logger.warn(
          {
            sessionId: session.id,
            userId: input.userId,
            questionId,
          },
          'Completed session feedback missing question state; defaulting to unanswered',
        );
      }

      const attempt = attemptByQuestionId.get(questionId);
      const selectedChoiceId = attempt
        ? selectedChoiceIdOrNull(attempt.outcome)
        : (state?.latestSelectedChoiceId ?? null);
      const isOmitted = attempt ? isOmittedOutcome(attempt.outcome) : false;
      const isAnswered = selectedChoiceId !== null;
      if (isAnswered) answeredCount += 1;

      reviewSeeds.push({
        questionId,
        order: i + 1,
        isAnswered,
        isCorrect: attempt?.isCorrect ?? state?.latestIsCorrect ?? null,
        isOmitted,
        markedForReview: state?.markedForReview ?? false,
        selectedChoiceId,
      });
    }

    const rows = enrichWithQuestion({
      rows: reviewSeeds,
      getQuestionId: (row) => row.questionId,
      questionsById: questionById,
      available: (row, question): CompletedSessionQuestionWithFeedbackRow => {
        const shuffledChoices = buildShuffledChoiceViews(
          question,
          input.userId,
        );
        const correctChoice = question.choices.find(
          (choice) => choice.isCorrect,
        );
        if (!correctChoice) {
          throw new ApplicationError(
            'INTERNAL_ERROR',
            `Question ${question.id} has no correct choice`,
          );
        }

        return {
          isAvailable: true,
          questionId: question.id,
          slug: question.slug,
          stemMd: question.stemMd,
          difficulty: question.difficulty,
          order: row.order,
          isAnswered: row.isAnswered,
          isCorrect: row.isCorrect,
          isOmitted: row.isOmitted,
          markedForReview: row.markedForReview,
          choices: shuffledChoices.map((choice) => ({
            id: choice.choiceId,
            label: choice.displayLabel,
            textMd: choice.textMd,
          })),
          selectedChoiceId: row.selectedChoiceId,
          correctChoiceId: correctChoice.id,
          explanationMd: question.explanationMd,
          referenceMd: question.referenceMd ?? null,
          choiceExplanations: shuffledChoices.map((choice) => ({
            choiceId: choice.choiceId,
            displayLabel: choice.displayLabel,
            textMd: choice.textMd,
            isCorrect: choice.isCorrect,
            explanationMd: choice.explanationMd,
          })),
        };
      },
      unavailable: (row): CompletedSessionQuestionWithFeedbackRow => ({
        isAvailable: false,
        questionId: row.questionId,
        order: row.order,
        isAnswered: row.isAnswered,
        isCorrect: row.isCorrect,
        isOmitted: row.isOmitted,
        markedForReview: row.markedForReview,
      }),
      logger: this.logger,
      missingQuestionMessage:
        'Completed session feedback references missing question',
    });

    return {
      sessionId: session.id,
      mode: session.mode,
      totalCount: session.questionIds.length,
      answeredCount,
      markedCount: rows.filter((row) => row.markedForReview).length,
      rows,
    };
  }
}
