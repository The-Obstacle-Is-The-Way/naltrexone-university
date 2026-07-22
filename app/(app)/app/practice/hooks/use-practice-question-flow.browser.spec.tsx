import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeQuestionFlow } from './use-practice-question-flow';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();

vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });
vi.mock('@/src/adapters/controllers/question-controller', { spy: true });

const getBookmarkQuestionIds = vi.mocked(
  bookmarkController.getBookmarkQuestionIds,
);
const setBookmark = vi.mocked(bookmarkController.setBookmark);
const getNextQuestion = vi.mocked(questionController.getNextQuestion);
const submitAnswer = vi.mocked(questionController.submitAnswer);

const TEST_FILTERS = {
  tagSlugs: [],
  difficulty: null,
  status: 'unanswered',
} satisfies PracticeFilters;

function PracticeQuestionFlowHookProbe() {
  const output = usePracticeQuestionFlow({ filters: TEST_FILTERS });

  const errorMessage =
    output.loadState.status === 'error' ? output.loadState.message : '';

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <div data-testid="bookmark-status">{output.bookmarkStatus}</div>
      <div data-testid="can-submit">{String(output.canSubmit)}</div>
      <div data-testid="error-message">{errorMessage}</div>
    </>
  );
}

function PracticeQuestionFlowBookmarkProbe() {
  const output = usePracticeQuestionFlow({ filters: TEST_FILTERS });
  const [bookmarkFeedbackCount, setBookmarkFeedbackCount] = useState(0);
  const bookmarkMessage = output.bookmarkMessage;
  const bookmarkMessageVersion = output.bookmarkMessageVersion;

  useEffect(() => {
    if (!bookmarkMessage) return;
    if (bookmarkMessageVersion < 1) return;
    setBookmarkFeedbackCount((prev) => prev + 1);
  }, [bookmarkMessage, bookmarkMessageVersion]);

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="bookmark-feedback-count">{bookmarkFeedbackCount}</div>
      <button type="button" onClick={() => void output.onToggleBookmark()}>
        toggle-bookmark
      </button>
    </>
  );
}

function PracticeQuestionFlowSubmitProbe() {
  const output = usePracticeQuestionFlow({ filters: TEST_FILTERS });

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="is-pending">{String(output.isPending)}</div>
      <button
        type="button"
        onClick={() => output.onSelectChoice(fixtureChoice1Id, 'pointer')}
      >
        select-choice-1
      </button>
      <button type="button" onClick={() => void output.onSubmit()}>
        submit-answer
      </button>
    </>
  );
}

describe('usePracticeQuestionFlow (browser)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads question data and transitions to ready state', async () => {
    getNextQuestion.mockResolvedValue(
      ok(
        createNextQuestion({
          slug: 'question-1',
          stemMd: 'What is the best next step?',
        }),
      ),
    );
    getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));

    const screen = await render(<PracticeQuestionFlowHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('q_1');
    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('false');
  });

  it('transitions to error state when question loading throws', async () => {
    getNextQuestion.mockRejectedValue(new Error('Network down'));
    getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));

    const screen = await render(<PracticeQuestionFlowHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Network down');
  });

  it('emits bookmark feedback for repeated identical success messages', async () => {
    getNextQuestion.mockResolvedValue(
      ok(
        createNextQuestion({
          slug: 'question-1',
          stemMd: 'What is the best next step?',
        }),
      ),
    );
    getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));
    setBookmark.mockResolvedValue(ok({ bookmarked: true }));

    const screen = await render(<PracticeQuestionFlowBookmarkProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();
    await expect
      .element(screen.getByTestId('bookmark-feedback-count'))
      .toHaveTextContent('1');

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();
    await expect
      .element(screen.getByTestId('bookmark-feedback-count'))
      .toHaveTextContent('2');
  });

  it('uses transition pending state for answer submit without switching to loading status', async () => {
    const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();

    getNextQuestion.mockResolvedValue(ok(createNextQuestion()));
    getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));
    submitAnswer.mockImplementation(async () => deferred.promise);

    const screen = await render(<PracticeQuestionFlowSubmitProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();

    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    deferred.resolve(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });
});
