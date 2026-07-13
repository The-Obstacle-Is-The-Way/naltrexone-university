import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import * as reportClientError from '@/lib/report-client-error';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { installReportClientErrorMocks } from '@/tests/test-helpers/report-client-error-mocks';
import { usePracticeQuestionAnswerFlow } from './use-practice-question-answer-flow';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureChoice2Id = crypto.randomUUID();

vi.mock('@/lib/report-client-error', { spy: true });

const { getNextQuestionMock, isMountedMock, submitAnswerMock } = vi.hoisted(
  () => ({
    getNextQuestionMock: vi.fn(),
    isMountedMock: vi.fn(),
    submitAnswerMock: vi.fn(),
  }),
);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);

installReportClientErrorMocks(reportClientError);

const TEST_FILTERS = {
  tagSlugs: [],
  difficulty: null,
  status: 'unanswered',
} satisfies PracticeFilters;

function createSubmitOutput(
  correctChoiceId: string = fixtureChoice1Id,
): SubmitAnswerOutput {
  return {
    attemptId: fixtureAttempt1Id,
    isCorrect: true,
    correctChoiceId,
    explanationMd: null,
    referenceMd: null,
    choiceExplanations: [],
  };
}

function PracticeQuestionAnswerFlowProbe() {
  const output = usePracticeQuestionAnswerFlow({
    filters: TEST_FILTERS,
    isMounted: isMountedMock,
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
      <button
        type="button"
        onClick={() => output.onSelectChoice(fixtureChoice1Id, 'pointer')}
      >
        select-choice-1
      </button>
      <button
        type="button"
        onClick={() => output.onSelectChoice(fixtureChoice2Id, 'pointer')}
      >
        select-choice-2
      </button>
      <button
        type="button"
        onClick={() => {
          output.onSelectChoice(fixtureChoice1Id, 'pointer');
          output.onSelectChoice(fixtureChoice2Id, 'pointer');
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
          void output.onSubmit();
          void output.onSubmit();
        }}
      >
        submit-answer-twice
      </button>
      <button
        type="button"
        onClick={() => {
          output.onSelectChoice(fixtureChoice1Id, 'pointer');
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
  beforeEach(() => {
    isMountedMock.mockImplementation(() => true);
  });

  afterEach(() => {
    getNextQuestionMock.mockReset();
    isMountedMock.mockReset();
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
      .mockResolvedValueOnce(
        ok(createNextQuestion({ questionId: fixtureQ2Id })),
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
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent(fixtureChoice1Id);
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    submitDeferred.resolve(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
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
      .toHaveTextContent(fixtureQ2Id);
  });

  it('commits the clicked choice without waiting for selectedChoiceId to re-render', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
            { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice2Id,
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
        choiceId: fixtureChoice2Id,
      }),
    );
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('does not double-commit when two selections happen in the same event', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
            { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
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
      .toHaveTextContent(fixtureChoice1Id);
    expect(submitAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        choiceId: fixtureChoice1Id,
      }),
    );
    submitDeferred.resolve(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
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
            { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
            { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
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
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
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
            { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
            { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
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
      expect.objectContaining({ choiceId: fixtureChoice1Id }),
    );

    await screen
      .getByRole('button', { name: 'submit-answer', exact: true })
      .click();

    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
    submitDeferred.resolve(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('does not programmatically submit before a choice is selected', async () => {
    getNextQuestionMock.mockResolvedValue(ok(createNextQuestion()));
    submitAnswerMock.mockResolvedValue(ok(createSubmitOutput()));

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('false');

    await screen
      .getByRole('button', { name: 'submit-answer', exact: true })
      .click();

    expect(submitAnswerMock).not.toHaveBeenCalled();
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('does not commit when a previous submit result has locked the question', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
            { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
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
      .toHaveTextContent(fixtureChoice1Id);
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
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
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

    await screen
      .getByRole('button', { name: 'submit-answer', exact: true })
      .click();

    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces submit errors and keeps programmatic retry single-flight', async () => {
    const submitError = new Error('Submit exploded');

    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          choices: [
            { id: fixtureChoice1Id, label: 'A', textMd: 'A', sortOrder: 1 },
            { id: fixtureChoice2Id, label: 'B', textMd: 'B', sortOrder: 2 },
          ],
        }),
      ),
    );
    submitAnswerMock
      .mockRejectedValueOnce(submitError)
      .mockResolvedValueOnce(ok(createSubmitOutput(fixtureChoice2Id)));

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen
      .getByRole('button', { name: 'select-choice-1', exact: true })
      .click();

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Submit exploded');
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'submit-answer-twice' }).click();

    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(2);
    expect(submitAnswerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ choiceId: fixtureChoice1Id }),
    );
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('false');
  });

  it('reports unexpected submit orchestration errors', async () => {
    const submitError = new Error('Submit rejected');
    const unhandledError = new Error('isMounted exploded');
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    getNextQuestionMock.mockResolvedValue(ok(createNextQuestion()));
    submitAnswerMock.mockRejectedValueOnce(submitError);

    const screen = await render(<PracticeQuestionAnswerFlowProbe />);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    isMountedMock.mockImplementation(() => {
      throw unhandledError;
    });
    await screen
      .getByRole('button', { name: 'select-choice-1', exact: true })
      .click();

    await expect.poll(() => reportClientErrorSpy.mock.calls.length).toBe(1);
    expect(reportClientErrorSpy).toHaveBeenCalledWith(unhandledError, {
      component: 'UsePracticeQuestionAnswerFlow',
      action: 'submitAnswer',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'runTransitionedAsyncAction: unhandled error in run()',
      unhandledError,
    );
  });
});
