import { describe, expect, it } from 'vitest';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { buildShuffledChoiceViews } from '@/src/application/shared/shuffled-choice-views';
import {
  createAttempt,
  createChoice,
  createQuestion,
  createUser,
} from '@/src/domain/test-helpers';
import { getQuestionBySlug } from './question-view-controller';
import { createQuestionViewControllerDeps } from './test-helpers/question-view-controller-test-helpers';

function mapChoicesForOutput(
  question: ReturnType<typeof createQuestion>,
  userId: string,
) {
  return buildShuffledChoiceViews(question, userId).map((choice) => ({
    id: choice.choiceId,
    label: choice.displayLabel,
    textMd: choice.textMd,
  }));
}

function findUserIdWithNonCanonicalShuffle(
  question: ReturnType<typeof createQuestion>,
) {
  if (question.choices.length <= 1) {
    throw new Error(
      `Test setup requires at least 2 choices (received ${question.choices.length})`,
    );
  }

  const canonicalChoices = question.choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    textMd: choice.textMd,
  }));

  // buildShuffledChoiceViews uses a deterministic shuffle based on userId and questionId.
  // To ensure the tests would fail if the controller returned canonical order, probe
  // multiple userIds until we find one whose shuffle differs from the canonical mapping.
  for (let i = 0; i < 50; i++) {
    const userId = crypto.randomUUID();
    const shuffledChoices = mapChoicesForOutput(question, userId);
    if (JSON.stringify(shuffledChoices) !== JSON.stringify(canonicalChoices)) {
      return userId;
    }
  }

  throw new Error(
    'Test setup failed: no userId produced non-canonical shuffle output',
  );
}

function createThrowingQuestionRepository(
  errorMessage = 'QuestionRepository should not be called',
): QuestionRepository {
  return {
    findPublishedById: async () => {
      throw new Error(errorMessage);
    },
    findPublishedBySlug: async () => {
      throw new Error(errorMessage);
    },
    findPublishedByIds: async () => {
      throw new Error(errorMessage);
    },
    findIdBySlug: async () => {
      throw new Error(errorMessage);
    },
    findPublishedByBindings: async () => {
      throw new Error(errorMessage);
    },
    findByIdForSession: async () => {
      throw new Error(errorMessage);
    },
    findByIdsForSession: async () => {
      throw new Error(errorMessage);
    },
    listPublishedCandidateIds: async () => {
      throw new Error(errorMessage);
    },
    countPublishedCandidateIds: async () => {
      throw new Error(errorMessage);
    },
  };
}

describe('question-view-controller', () => {
  describe('getQuestionBySlug', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createQuestionViewControllerDeps();

      const result = await getQuestionBySlug({ slug: '' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createQuestionViewControllerDeps({ user: null });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createQuestionViewControllerDeps({
        isEntitled: false,
        questionRepository: createThrowingQuestionRepository(),
      });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('returns NOT_FOUND when the question does not exist', async () => {
      const deps = createQuestionViewControllerDeps({ question: null });

      const result = await getQuestionBySlug({ slug: 'q-404' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('returns the question with choices when found', async () => {
      const questionId = crypto.randomUUID();
      const firstChoiceId = crypto.randomUUID();
      const secondChoiceId = crypto.randomUUID();
      const question = createQuestion({
        id: questionId,
        slug: 'q-1',
        stemMd: 'Stem for q1',
        difficulty: 'medium',
        choices: [
          createChoice({
            id: firstChoiceId,
            questionId,
            label: 'A',
            textMd: 'Choice A',
            isCorrect: false,
            sortOrder: 1,
          }),
          createChoice({
            id: secondChoiceId,
            questionId,
            label: 'B',
            textMd: 'Choice B',
            isCorrect: true,
            sortOrder: 2,
          }),
        ],
      });

      const userId = findUserIdWithNonCanonicalShuffle(question);
      const deps = createQuestionViewControllerDeps({
        question,
        user: createUser({ id: userId }),
      });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          questionId,
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'medium',
          choices: mapChoicesForOutput(question, userId),
          withdrawn: false,
        },
      });
    });

    it('returns a withdrawn question to the learner reviewing their own attempt, marked withdrawn (ADR-021 §3)', async () => {
      const question = createQuestion({
        slug: 'q-withdrawn',
        status: 'archived',
      });
      const user = createUser();
      const attempt = createAttempt({
        userId: user.id,
        questionId: question.id,
      });
      const deps = createQuestionViewControllerDeps({
        question,
        user,
        attempts: [attempt],
      });

      const result = await getQuestionBySlug(
        { slug: 'q-withdrawn', review: { attemptId: attempt.id } },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: true,
        data: { questionId: question.id, withdrawn: true },
      });
    });

    it('returns NOT_FOUND for a withdrawn question outside review', async () => {
      const question = createQuestion({
        slug: 'q-withdrawn',
        status: 'archived',
      });
      const user = createUser();
      const deps = createQuestionViewControllerDeps({
        question,
        user,
        attempts: [createAttempt({ userId: user.id, questionId: question.id })],
      });

      const result = await getQuestionBySlug(
        { slug: 'q-withdrawn' },
        deps as never,
      );

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });

    it('rejects a review naming both an attempt and a session', async () => {
      const deps = createQuestionViewControllerDeps();

      const result = await getQuestionBySlug(
        {
          slug: 'q-1',
          review: {
            attemptId: crypto.randomUUID(),
            sessionId: crypto.randomUUID(),
          },
        },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns shuffled labels consistent with buildShuffledChoiceViews', async () => {
      const questionId = crypto.randomUUID();
      const firstChoiceId = crypto.randomUUID();
      const secondChoiceId = crypto.randomUUID();
      const thirdChoiceId = crypto.randomUUID();
      const fourthChoiceId = crypto.randomUUID();
      const question = createQuestion({
        id: questionId,
        slug: 'q-2',
        stemMd: 'Stem for q2',
        difficulty: 'hard',
        choices: [
          createChoice({
            id: firstChoiceId,
            questionId,
            label: 'A',
            textMd: 'Choice A',
            isCorrect: false,
            sortOrder: 1,
          }),
          createChoice({
            id: secondChoiceId,
            questionId,
            label: 'B',
            textMd: 'Choice B',
            isCorrect: false,
            sortOrder: 2,
          }),
          createChoice({
            id: thirdChoiceId,
            questionId,
            label: 'C',
            textMd: 'Choice C',
            isCorrect: true,
            sortOrder: 3,
          }),
          createChoice({
            id: fourthChoiceId,
            questionId,
            label: 'D',
            textMd: 'Choice D',
            isCorrect: false,
            sortOrder: 4,
          }),
        ],
      });

      const userId = findUserIdWithNonCanonicalShuffle(question);
      const deps = createQuestionViewControllerDeps({
        question,
        user: createUser({ id: userId }),
      });

      const result = await getQuestionBySlug({ slug: 'q-2' }, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          questionId,
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'hard',
          choices: mapChoicesForOutput(question, userId),
          withdrawn: false,
        },
      });
    });
  });
});
