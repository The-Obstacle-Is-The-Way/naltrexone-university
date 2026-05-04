import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
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
      <button type="button" onClick={() => output.onSelectChoice('choice_2')}>
        select-choice-2
      </button>
      <button
        type="button"
        onClick={() => {
          output.onSelectChoice('choice_1');
          output.onSelectChoice('choice_2');
        }}
      >
        select-choice-1-then-2
      </button>
      <button type="button" onClick={() => void output.onSubmit()}>
        submit-answer
      </button>
      <button
        type="button"
        onClick={() => {
          output.onSelectChoice('choice_1');
          void output.onSubmit();
        }}
      >
        select-choice-1-then-submit
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

  it('supports selecting, committing, and fetching the next question', async () => {
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();

    getNextQuestionMock
      .mockResolvedValueOnce(ok(createNextQuestion()))
      .mockResolvedValueOnce(ok(createNextQuestion({ questionId: 'q_2' })));
    submitAnswerMock.mockImplementation(async () => submitDeferred.promise);

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen
      .getByRole('button', { name: 'select-choice-1', exact: true })
      .click();
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
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
        referenceMd: null,
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

  it('commits the clicked choice without waiting for selectedChoiceId to re-render', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
            { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_2',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByRole('button', { name: 'select-choice-2' }).click();

    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);
    expect(submitAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        choiceId: 'choice_2',
      }),
    );
  });

  it('does not double-commit when two selections happen in the same event', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
            { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
    submitAnswerMock.mockImplementation(async () => submitDeferred.promise);

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen
      .getByRole('button', { name: 'select-choice-1-then-2' })
      .click();

    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
    expect(submitAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        choiceId: 'choice_1',
      }),
    );
    submitDeferred.resolve(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('does not double-commit while a choice commit is pending', async () => {
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();

    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
            { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    submitAnswerMock.mockImplementation(async () => submitDeferred.promise);

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen
      .getByRole('button', { name: 'select-choice-1', exact: true })
      .click();
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('true');
    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);

    await screen.getByRole('button', { name: 'select-choice-2' }).click();

    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
    submitDeferred.resolve(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('does not programmatically submit while a choice commit is pending', async () => {
    const submitDeferred = createDeferred<ActionResult<SubmitAnswerOutput>>();

    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
            { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    submitAnswerMock.mockImplementation(async () => submitDeferred.promise);

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen
      .getByRole('button', { name: 'select-choice-1-then-submit' })
      .click();

    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('true');
    expect(submitAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({ choiceId: 'choice_1' }),
    );

    await screen.getByRole('button', { name: 'submit-answer' }).click();

    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
    submitDeferred.resolve(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('does not commit when a previous submit result has locked the question', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
            { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen
      .getByRole('button', { name: 'select-choice-1', exact: true })
      .click();
    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'select-choice-2' }).click();

    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
  });

  it('does not programmatically resubmit after submitResult locks the question', async () => {
    getNextQuestionMock.mockResolvedValue(ok(createNextQuestion()));
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen
      .getByRole('button', { name: 'select-choice-1', exact: true })
      .click();
    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'submit-answer' }).click();

    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
  });
});
