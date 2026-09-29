import { describe, expect, it, vi } from 'vitest';
import {
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';

const fixtureChoice1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

function createFixtureNextQuestion() {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    choices: [
      { id: fixtureChoice1Id, label: 'A', textMd: 'Choice A', sortOrder: 1 },
    ],
  });
}

// ADR-021 §3 and Pattern Registry F-11: a session item whose question was
// withdrawn after the session began.
describe('practice-session-page-logic, withdrawn session items', () => {
  describe('loadNextQuestion', () => {
    // ADR-021 §3, Pattern Registry F-11: a question withdrawn after the
    // session began comes back as its place in the session, with no content.
    it('records a withdrawn item, with no question, and moves the session to it', async () => {
      const setLoadState = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();
      const setWithdrawnQuestionId = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () =>
          ok({
            withdrawn: true as const,
            questionId: fixtureQuestion2Id,
            session: {
              sessionId: fixtureSession1Id,
              mode: 'exam' as const,
              index: 1,
              total: 2,
              deadlineAt: null,
              isMarkedForReview: false,
            },
          }),
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo,
        setWithdrawnQuestionId,
      });

      expect(setWithdrawnQuestionId).toHaveBeenLastCalledWith(
        fixtureQuestion2Id,
      );
      expect(setQuestion).toHaveBeenLastCalledWith(null);
      expect(setSessionInfo).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: 'exam', index: 1, total: 2 }),
      );
      expect(setLoadState).toHaveBeenLastCalledWith({ status: 'ready' });
    });

    it('clears a recorded withdrawn item when a question loads', async () => {
      const setQuestion = vi.fn();
      const setWithdrawnQuestionId = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () => ok(createFixtureNextQuestion()),
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo: vi.fn(),
        setWithdrawnQuestionId,
      });

      expect(setWithdrawnQuestionId).toHaveBeenLastCalledWith(null);
      expect(setQuestion).toHaveBeenLastCalledWith(
        expect.objectContaining({ questionId: fixtureQuestion1Id }),
      );
    });
  });

  // ADR-021 §3: the question was withdrawn while the learner had it open.
  // A not-found answer asks for the item: if it comes back withdrawn, the page
  // loads it and the notice replaces the error; otherwise the error stands.
  const withdrawnItem = {
    withdrawn: true as const,
    questionId: fixtureQuestion1Id,
    session: {
      sessionId: fixtureSession1Id,
      mode: 'tutor' as const,
      index: 0,
      total: 1,
      deadlineAt: null,
      isMarkedForReview: false,
    },
  };

  function reloadWith(
    getNextQuestionFn: () => Promise<
      | ReturnType<typeof ok<typeof withdrawnItem>>
      | ReturnType<typeof ok<ReturnType<typeof createFixtureNextQuestion>>>
    >,
  ) {
    const setWithdrawnQuestionId = vi.fn();
    return {
      setWithdrawnQuestionId,
      reload: {
        sessionId: fixtureSession1Id,
        getNextQuestionFn: vi.fn(getNextQuestionFn),
        nowMs: () => 0,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
        setSessionInfo: vi.fn(),
        setWithdrawnQuestionId,
      },
    };
  }

  function submitNotFound(
    reload: ReturnType<typeof reloadWith>['reload'],
    setLoadState: (state: unknown) => void,
    message = 'Question not found',
  ) {
    return submitAnswerForQuestion({
      sessionId: fixtureSession1Id,
      question: createFixtureNextQuestion(),
      selectedChoiceId: fixtureChoice1Id,
      questionLoadedAtMs: 0,
      submitRequestToken: null,
      createIdempotencyKey: () => 'idem_1',
      setSubmitRequestToken: vi.fn(),
      submitAnswerFn: async () => err('NOT_FOUND', message),
      nowMs: () => 0,
      setLoadState,
      setSubmitResult: vi.fn(),
      reload,
    });
  }

  describe('submitAnswerForQuestion', () => {
    it('loads the item, with no error, when it comes back withdrawn', async () => {
      const setLoadState = vi.fn();
      const { reload, setWithdrawnQuestionId } = reloadWith(async () =>
        ok(withdrawnItem),
      );

      await submitNotFound(reload, setLoadState);

      expect(reload.getNextQuestionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        questionId: fixtureQuestion1Id,
      });
      expect(setWithdrawnQuestionId).toHaveBeenLastCalledWith(
        fixtureQuestion1Id,
      );
      expect(setLoadState).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      );
    });

    it('keeps the error, loading nothing, when the item is still answerable', async () => {
      const setLoadState = vi.fn();
      const { reload, setWithdrawnQuestionId } = reloadWith(async () =>
        ok(createFixtureNextQuestion()),
      );

      await submitNotFound(reload, setLoadState, 'Choice not found');

      expect(reload.getNextQuestionFn).toHaveBeenCalledTimes(1);
      expect(setWithdrawnQuestionId).not.toHaveBeenCalled();
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Choice not found',
      });
    });

    it('keeps the error when asking for the item fails', async () => {
      const setLoadState = vi.fn();
      const { reload } = reloadWith(async () => {
        throw new Error('offline');
      });

      await submitNotFound(reload, setLoadState);

      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Question not found',
      });
    });

    it('asks for nothing after a submit error other than not-found', async () => {
      const setLoadState = vi.fn();
      const { reload } = reloadWith(async () => ok(withdrawnItem));

      await submitAnswerForQuestion({
        sessionId: fixtureSession1Id,
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
        reload,
      });

      expect(reload.getNextQuestionFn).not.toHaveBeenCalled();
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });
  });
});
