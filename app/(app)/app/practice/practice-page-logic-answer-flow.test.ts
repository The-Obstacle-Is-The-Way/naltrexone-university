import { describe, expect, it, vi } from 'vitest';
import {
  canSubmitAnswer,
  selectChoiceIfAllowed,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

const { fixtureAttempt1Id, fixtureChoice1Id, fixtureQuestion1Id } = vi.hoisted(
  () => ({
    fixtureAttempt1Id: crypto.randomUUID(),
    fixtureChoice1Id: crypto.randomUUID(),
    fixtureQuestion1Id: crypto.randomUUID(),
  }),
);

function createFixtureNextQuestion(
  overrides: Parameters<typeof createNextQuestion>[0] = {},
) {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    choices: [
      {
        id: fixtureChoice1Id,
        label: 'A',
        textMd: 'Choice A',
        sortOrder: 1,
      },
    ],
    ...overrides,
  });
}

describe('practice-page-logic answer flow', () => {
  describe('canSubmitAnswer', () => {
    it('returns true when question is loaded, choice is selected, and not loading', () => {
      expect(
        canSubmitAnswer({
          loadState: { status: 'ready' },
          question: createFixtureNextQuestion(),
          selectedChoiceId: fixtureChoice1Id,
          isAnswered: false,
          submitResult: null,
        }),
      ).toBe(true);
    });

    it('returns false when loadState is loading', () => {
      expect(
        canSubmitAnswer({
          loadState: { status: 'loading' },
          question: createFixtureNextQuestion(),
          selectedChoiceId: fixtureChoice1Id,
          isAnswered: false,
          submitResult: null,
        }),
      ).toBe(false);
    });

    it('returns false when submitResult exists', () => {
      expect(
        canSubmitAnswer({
          loadState: { status: 'ready' },
          question: createFixtureNextQuestion(),
          selectedChoiceId: fixtureChoice1Id,
          isAnswered: false,
          submitResult: {
            attemptId: fixtureAttempt1Id,
            isCorrect: true,
            correctChoiceId: fixtureChoice1Id,
            explanationMd: 'Because…',
            referenceMd: null,
            choiceExplanations: [],
          },
        }),
      ).toBe(false);
    });

    it('returns false when question is already answered', () => {
      expect(
        canSubmitAnswer({
          loadState: { status: 'ready' },
          question: createFixtureNextQuestion(),
          selectedChoiceId: fixtureChoice1Id,
          isAnswered: true,
          submitResult: null,
        }),
      ).toBe(false);
    });
  });

  describe('submitAnswerForQuestion', () => {
    it('submits answer and sets result on success', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 1000,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn,
        nowMs: () => 6000,
        setLoadState,
        setSubmitResult,
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: fixtureQuestion1Id,
        choiceId: fixtureChoice1Id,
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 5,
      });
      expect(setSubmitResult).toHaveBeenCalledWith(
        expect.objectContaining({ isCorrect: true }),
        fixtureQuestion1Id,
      );
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'loading' });
    });

    it('defaults timeSpentSeconds to 0 when loadedAt is null', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitAnswerForQuestion({
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: null,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn,
        nowMs: () => 0,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith(
        expect.objectContaining({ timeSpentSeconds: 0 }),
      );
    });

    it('computes timeSpentSeconds when loadedAt is 0', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitAnswerForQuestion({
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn,
        nowMs: () => 1500,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith(
        expect.objectContaining({ timeSpentSeconds: 1 }),
      );
    });

    it('sets error state when submit fails', async () => {
      const setLoadState = vi.fn();

      await submitAnswerForQuestion({
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => err('INTERNAL_ERROR', 'Boom'),
        nowMs: () => 0,
        setLoadState,
        setSubmitResult: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });

    it('sets error state when submit throws', async () => {
      const setLoadState = vi.fn();

      await submitAnswerForQuestion({
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => {
          throw new Error('Boom');
        },
        nowMs: () => 0,
        setLoadState,
        setSubmitResult: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });

    it('returns no state updates when unmounted during submitAnswerForQuestion', async () => {
      const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      const promise = submitAnswerForQuestion({
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => deferred.promise,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );
      await promise;

      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });

    it('returns no state updates when submit response is stale', async () => {
      const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      const promise = submitAnswerForQuestion({
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => deferred.promise,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult,
        createRequestSequenceId: () => 1,
        isLatestRequest: () => false,
      });

      deferred.resolve(
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );
      await promise;

      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalled();
    });
  });

  describe('selectChoiceIfAllowed', () => {
    it('does nothing when submitResult exists', () => {
      const setSelectedChoiceId = vi.fn();

      const changed = selectChoiceIfAllowed(
        {
          isAnswered: false,
          submitResult: {
            attemptId: fixtureAttempt1Id,
            isCorrect: true,
            correctChoiceId: fixtureChoice1Id,
            explanationMd: 'Because...',
            referenceMd: null,
            choiceExplanations: [],
          },
        },
        setSelectedChoiceId,
        fixtureChoice1Id,
      );

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(changed).toBe(false);
    });

    it('sets the choice when no submitResult exists', () => {
      const setSelectedChoiceId = vi.fn();

      const changed = selectChoiceIfAllowed(
        { isAnswered: false, submitResult: null },
        setSelectedChoiceId,
        fixtureChoice1Id,
      );

      expect(setSelectedChoiceId).toHaveBeenCalledWith(fixtureChoice1Id);
      expect(changed).toBe(true);
    });

    it('does nothing when question is already answered', () => {
      const setSelectedChoiceId = vi.fn();

      const changed = selectChoiceIfAllowed(
        { isAnswered: true, submitResult: null },
        setSelectedChoiceId,
        fixtureChoice1Id,
      );

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(changed).toBe(false);
    });
  });
});
