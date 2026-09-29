import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type {
  GetNextQuestionOutput,
  WithdrawnSessionQuestion,
} from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionQuestionFlow } from './use-practice-session-question-flow';

const fixtureSessionId = crypto.randomUUID();
const notFound = {
  ok: false as const,
  error: { code: 'NOT_FOUND' as const, message: 'Question not found' },
};
const choiceNotFound = {
  ok: false as const,
  error: { code: 'NOT_FOUND' as const, message: 'Choice not found' },
};
const fixtureQ1Id = crypto.randomUUID();
const fixtureChoiceId = crypto.randomUUID();

function withdrawnItem(questionId: string): WithdrawnSessionQuestion {
  return {
    withdrawn: true,
    questionId,
    session: {
      sessionId: fixtureSessionId,
      mode: 'tutor',
      index: 0,
      total: 2,
      deadlineAt: null,
      isMarkedForReview: false,
    },
  };
}

function renderFlow(input: {
  getNextQuestionFn: (
    request: unknown,
  ) => Promise<ActionResult<GetNextQuestionOutput>>;
  submitAnswerFn?: (
    request: unknown,
  ) => Promise<ActionResult<SubmitAnswerOutput>>;
}) {
  return renderHook(() =>
    usePracticeSessionQuestionFlow({
      sessionId: fixtureSessionId,
      isMounted: () => true,
      getNextQuestionFn: input.getNextQuestionFn,
      submitAnswerFn:
        input.submitAnswerFn ??
        vi.fn<
          (request: unknown) => Promise<ActionResult<SubmitAnswerOutput>>
        >(),
      saveExamDraftAnswerFn:
        vi.fn<
          (request: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
        >(),
    }),
  );
}

// ADR-021 §3, Pattern Registry F-11: an item whose question was withdrawn
// after the session began has its place in the session and no question.
describe('usePracticeSessionQuestionFlow with a withdrawn item (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a withdrawn item on load, with no question', async () => {
    const harness = await renderFlow({
      getNextQuestionFn: vi.fn(async () => ok(withdrawnItem(fixtureQ1Id))),
    });

    await expect
      .poll(() => harness.result.current.withdrawnQuestionId)
      .toBe(fixtureQ1Id);
    expect(harness.result.current.question).toBeNull();
    expect(harness.result.current.sessionInfo).toMatchObject({ index: 0 });
    expect(harness.result.current.loadState).toEqual({ status: 'ready' });
  });

  it('reloads the item, not an error, when a tutor answer finds its question withdrawn', async () => {
    const getNextQuestionFn = vi
      .fn<(request: unknown) => Promise<ActionResult<GetNextQuestionOutput>>>()
      .mockResolvedValueOnce(
        ok(
          createNextQuestion({
            questionId: fixtureQ1Id,
            choices: [
              { id: fixtureChoiceId, label: 'A', textMd: 'A', sortOrder: 1 },
            ],
            session: {
              sessionId: fixtureSessionId,
              mode: 'tutor',
              deadlineAt: null,
              index: 0,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        ),
      )
      .mockResolvedValue(ok(withdrawnItem(fixtureQ1Id)));
    const harness = await renderFlow({
      getNextQuestionFn,
      submitAnswerFn: vi.fn(async () => notFound),
    });
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoiceId, 'pointer');

    await expect
      .poll(() => harness.result.current.withdrawnQuestionId)
      .toBe(fixtureQ1Id);
    expect(getNextQuestionFn).toHaveBeenLastCalledWith({
      sessionId: fixtureSessionId,
      questionId: fixtureQ1Id,
    });
    expect(harness.result.current.question).toBeNull();
    expect(harness.result.current.loadState).toEqual({ status: 'ready' });
  });

  it('keeps a not-found answer error when the item reloads still answerable', async () => {
    const question = createNextQuestion({
      questionId: fixtureQ1Id,
      choices: [{ id: fixtureChoiceId, label: 'A', textMd: 'A', sortOrder: 1 }],
      session: {
        sessionId: fixtureSessionId,
        mode: 'tutor',
        deadlineAt: null,
        index: 0,
        total: 2,
        isMarkedForReview: false,
      },
    });
    const harness = await renderFlow({
      getNextQuestionFn: vi.fn(async () => ok(question)),
      submitAnswerFn: vi.fn(async () => choiceNotFound),
    });
    await expect
      .poll(() => harness.result.current.question?.questionId)
      .toBe(fixtureQ1Id);

    harness.result.current.onSelectChoice(fixtureChoiceId, 'pointer');

    await expect
      .poll(() => harness.result.current.loadState)
      .toEqual({ status: 'error', message: 'Choice not found' });
    expect(harness.result.current.withdrawnQuestionId).toBeNull();
  });
});
