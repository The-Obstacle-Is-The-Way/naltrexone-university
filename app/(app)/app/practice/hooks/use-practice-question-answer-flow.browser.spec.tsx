import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import type { PracticeFilters } from '../practice-page-logic';
import { usePracticeQuestionAnswerFlow } from './use-practice-question-answer-flow';

const { getNextQuestionMock, submitAnswerMock } = vi.hoisted(() => ({
  getNextQuestionMock: vi.fn(),
  submitAnswerMock: vi.fn(),
}));

const TEST_FILTERS = {
  tagSlugs: [],
  difficulty: null,
  status: 'unanswered',
} satisfies PracticeFilters;

function PracticeQuestionAnswerFlowProbe() {
  const output = usePracticeQuestionAnswerFlow({
    filters: TEST_FILTERS,
    isMounted: () => true,
    getNextQuestionFn: getNextQuestionMock,
    submitAnswerFn: submitAnswerMock,
  });

  const errorMessage =
    output.loadState.status === 'error' ? output.loadState.message : '';

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="is-pending">{String(output.isPending)}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <div data-testid="selected-choice-id">
        {output.selectedChoiceId ?? ''}
      </div>
      <div data-testid="can-submit">{String(output.canSubmit)}</div>
      <div data-testid="error-message">{errorMessage}</div>
      <button type="button" onClick={() => output.onSelectChoice('choice_1')}>
        select-choice-1
      </button>
      <button type="button" onClick={() => void output.onSubmit()}>
        submit-answer
      </button>
      <button type="button" onClick={() => output.onNextQuestion()}>
        next-question
      </button>
    </>
  );
}

describe('usePracticeQuestionAnswerFlow (browser)', () => {
  afterEach(() => {
    getNextQuestionMock.mockReset();
    submitAnswerMock.mockReset();
    vi.restoreAllMocks();
  });

  it('loads question data and transitions to ready state', async () => {
    getNextQuestionMock.mockResolvedValue(ok(createNextQuestion()));

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('q_1');
  });

  it('transitions to error state when question loading throws', async () => {
    getNextQuestionMock.mockRejectedValue(new Error('Network down'));

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Network down');
  });

  it('supports selecting, submitting, and fetching the next question', async () => {
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();

    getNextQuestionMock
      .mockResolvedValueOnce(ok(createNextQuestion()))
      .mockResolvedValueOnce(ok(createNextQuestion({ questionId: 'q_2' })));
    submitAnswerMock.mockImplementation(async () => submitDeferred.promise);

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('true');

    await screen.getByRole('button', { name: 'submit-answer' }).click();

    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    submitDeferred.resolve(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'next-question' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('q_2');
  });
});
