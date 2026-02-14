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

  await screen.getByRole('button', { name: 'load-no-session' }).click();
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

  await screen.getByRole('button', { name: 'load-no-session' }).click();
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

  await screen.getByRole('button', { name: 'load-no-session' }).click();
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
