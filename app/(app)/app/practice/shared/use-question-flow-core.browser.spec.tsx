import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { useQuestionFlowCore } from '@/app/(app)/app/practice/shared/use-question-flow-core';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';

function QuestionFlowCoreProbe() {
  const core = useQuestionFlowCore({ isMounted: () => true });

  return (
    <>
      <div data-testid="selected-choice-id">{core.selectedChoiceId ?? ''}</div>
      <div data-testid="is-answered">{String(core.isAnswered)}</div>
      <div data-testid="has-submit-result">
        {String(core.submitResult !== null)}
      </div>
      <div data-testid="submit-result-is-correct">
        {core.submitResult ? String(core.submitResult.isCorrect) : ''}
      </div>
      <div data-testid="submit-result-correct-choice-id">
        {core.submitResult?.correctChoiceId ?? ''}
      </div>
      <div data-testid="submit-result-explanation-md">
        {core.submitResult?.explanationMd ?? ''}
      </div>
      <div data-testid="submit-result-choice-explanations-length">
        {String(core.submitResult?.choiceExplanations.length ?? 0)}
      </div>
      <div data-testid="submit-result-choice-explanations-first-label">
        {core.submitResult?.choiceExplanations[0]?.displayLabel ?? ''}
      </div>
      <button
        type="button"
        onClick={() => {
          core.setQuestion(createNextQuestion({ questionId: 'q_1' }));
          core.setLoadState({ status: 'ready' });
        }}
      >
        load-no-session
      </button>
      <button
        type="button"
        onClick={() => {
          core.setQuestion(createNextQuestion({ questionId: 'q_2' }));
          core.setLoadState({ status: 'ready' });
        }}
      >
        load-no-session-q2
      </button>
      <button
        type="button"
        onClick={() => {
          core.setQuestion(
            createNextQuestion({
              questionId: 'q_1',
              choices: [
                { id: 'choice_1', label: 'A', textMd: 'A', sortOrder: 1 },
                { id: 'choice_2', label: 'B', textMd: 'B', sortOrder: 2 },
              ],
              session: {
                sessionId: 'session_1',
                mode: 'tutor',
                index: 0,
                total: 1,
                latestSelectedChoiceId: 'choice_2',
                latestIsCorrect: false,
                previousSubmission: {
                  correctChoiceId: 'choice_1',
                  explanationMd: 'Explanation',
                  choiceExplanations: [
                    {
                      choiceId: 'choice_1',
                      displayLabel: 'A',
                      textMd: 'A',
                      isCorrect: true,
                      explanationMd: 'Choice 1 explainer',
                    },
                    {
                      choiceId: 'choice_2',
                      displayLabel: 'B',
                      textMd: 'B',
                      isCorrect: false,
                      explanationMd: null,
                    },
                  ],
                },
              },
            }),
          );
          core.setLoadState({ status: 'ready' });
        }}
      >
        load-with-previous-submission
      </button>
      <button
        type="button"
        onClick={() => {
          core.setQuestion(
            createNextQuestion({
              questionId: 'q_1',
              session: {
                sessionId: 'session_1',
                mode: 'exam',
                index: 0,
                total: 1,
                latestSelectedChoiceId: 'choice_2',
              },
            }),
          );
          core.setLoadState({ status: 'ready' });
        }}
      >
        load-with-session-selection
      </button>
      <button type="button" onClick={() => core.onSelectChoice('choice_1')}>
        select-choice-1
      </button>
      <button type="button" onClick={() => core.setIsAnswered(true)}>
        mark-answered
      </button>
      <button
        type="button"
        onClick={() =>
          core.setSubmitResult({
            attemptId: 'attempt_1',
            isCorrect: false,
            correctChoiceId: 'choice_1',
            explanationMd: 'Explanation',
            choiceExplanations: [],
          })
        }
      >
        set-submit-result
      </button>
      <button
        type="button"
        onClick={() => {
          core.setSubmitResult(
            {
              attemptId: 'attempt_1',
              isCorrect: false,
              correctChoiceId: 'choice_1',
              explanationMd: 'Explanation',
              choiceExplanations: [],
            },
            'q_1',
          );
        }}
      >
        set-stale-submit-result
      </button>
      <button type="button" onClick={() => core.setQuestion(null)}>
        clear-question
      </button>
      <button
        type="button"
        onClick={() => core.setLoadState({ status: 'ready' })}
      >
        set-ready
      </button>
      <button
        type="button"
        onClick={() => core.setLoadState({ status: 'loading' })}
      >
        set-loading
      </button>
    </>
  );
}

test('clears derived selection state when the current question becomes null', async () => {
  const screen = await render(<QuestionFlowCoreProbe />);

  await screen
    .getByRole('button', { name: 'load-no-session', exact: true })
    .click();
  await screen.getByRole('button', { name: 'select-choice-1' }).click();
  await expect
    .element(screen.getByTestId('selected-choice-id'))
    .toHaveTextContent('choice_1');

  await screen.getByRole('button', { name: 'mark-answered' }).click();
  await expect
    .element(screen.getByTestId('is-answered'))
    .toHaveTextContent('true');

  await screen.getByRole('button', { name: 'clear-question' }).click();
  await screen.getByRole('button', { name: 'set-ready' }).click();
  await expect
    .element(screen.getByTestId('is-answered'))
    .toHaveTextContent('false');
  await expect
    .element(screen.getByTestId('selected-choice-id'))
    .toHaveTextContent('');
});

test('prefers session-selected choices over drafts and clears draft state', async () => {
  const screen = await render(<QuestionFlowCoreProbe />);

  await screen
    .getByRole('button', { name: 'load-no-session', exact: true })
    .click();
  await screen.getByRole('button', { name: 'select-choice-1' }).click();
  await expect
    .element(screen.getByTestId('selected-choice-id'))
    .toHaveTextContent('choice_1');
  await expect
    .element(screen.getByTestId('is-answered'))
    .toHaveTextContent('false');

  await screen
    .getByRole('button', { name: 'load-with-session-selection' })
    .click();
  await expect
    .element(screen.getByTestId('selected-choice-id'))
    .toHaveTextContent('choice_2');
  await expect
    .element(screen.getByTestId('is-answered'))
    .toHaveTextContent('true');

  await screen
    .getByRole('button', { name: 'load-no-session', exact: true })
    .click();
  await expect
    .element(screen.getByTestId('selected-choice-id'))
    .toHaveTextContent('');
  await expect
    .element(screen.getByTestId('is-answered'))
    .toHaveTextContent('false');
});

test('resets answered state when entering loading state', async () => {
  const screen = await render(<QuestionFlowCoreProbe />);

  await screen.getByRole('button', { name: 'mark-answered' }).click();
  await expect
    .element(screen.getByTestId('is-answered'))
    .toHaveTextContent('true');

  await screen.getByRole('button', { name: 'set-loading' }).click();
  await expect
    .element(screen.getByTestId('is-answered'))
    .toHaveTextContent('false');
});

test('restores submitResult when previousSubmission exists in session data', async () => {
  const screen = await render(<QuestionFlowCoreProbe />);

  await screen
    .getByRole('button', { name: 'load-with-previous-submission' })
    .click();

  await expect
    .element(screen.getByTestId('has-submit-result'))
    .toHaveTextContent('true');
  await expect
    .element(screen.getByTestId('submit-result-is-correct'))
    .toHaveTextContent('false');
  await expect
    .element(screen.getByTestId('submit-result-correct-choice-id'))
    .toHaveTextContent('choice_1');
  await expect
    .element(screen.getByTestId('submit-result-explanation-md'))
    .toHaveTextContent('Explanation');
  await expect
    .element(screen.getByTestId('submit-result-choice-explanations-length'))
    .toHaveTextContent('2');
  await expect
    .element(
      screen.getByTestId('submit-result-choice-explanations-first-label'),
    )
    .toHaveTextContent('A');
});

test('clears submitResult when previousSubmission is not present or question is unanswered', async () => {
  const screen = await render(<QuestionFlowCoreProbe />);

  await screen.getByRole('button', { name: 'set-submit-result' }).click();
  await expect
    .element(screen.getByTestId('has-submit-result'))
    .toHaveTextContent('true');

  await screen
    .getByRole('button', { name: 'load-with-session-selection' })
    .click();
  await expect
    .element(screen.getByTestId('has-submit-result'))
    .toHaveTextContent('false');

  await screen
    .getByRole('button', { name: 'load-no-session', exact: true })
    .click();
  await expect
    .element(screen.getByTestId('has-submit-result'))
    .toHaveTextContent('false');
});

test('clears submitResult when it belongs to a different question than the current question', async () => {
  const screen = await render(<QuestionFlowCoreProbe />);

  await screen.getByRole('button', { name: 'load-no-session-q2' }).click();
  await expect
    .element(screen.getByTestId('has-submit-result'))
    .toHaveTextContent('false');

  await screen.getByRole('button', { name: 'set-stale-submit-result' }).click();
  await expect
    .element(screen.getByTestId('has-submit-result'))
    .toHaveTextContent('true');

  await screen.getByRole('button', { name: 'set-ready' }).click();
  await expect
    .element(screen.getByTestId('has-submit-result'))
    .toHaveTextContent('false');
});
