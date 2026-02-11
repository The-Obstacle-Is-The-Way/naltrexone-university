import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import { useQuestionPageController } from './use-question-page-controller';

const { getQuestionBySlugMock, getPreviousAttemptMock, submitAnswerMock } =
  vi.hoisted(() => ({
    getQuestionBySlugMock: vi.fn(),
    getPreviousAttemptMock: vi.fn(),
    submitAnswerMock: vi.fn(),
  }));

vi.mock('@/src/adapters/controllers/question-view-controller', () => ({
  getQuestionBySlug: getQuestionBySlugMock,
  getPreviousAttempt: getPreviousAttemptMock,
}));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  submitAnswer: submitAnswerMock,
}));

function Probe({ mode }: { mode?: 'review' | null }) {
  const output = useQuestionPageController({ slug: 'q-1', mode });

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="selected-choice">{output.selectedChoiceId ?? ''}</div>
      <div data-testid="attempt-id">{output.submitResult?.attemptId ?? ''}</div>
    </>
  );
}

describe('useQuestionPageController (browser)', () => {
  afterEach(() => {
    getQuestionBySlugMock.mockReset();
    getPreviousAttemptMock.mockReset();
    submitAnswerMock.mockReset();
  });

  it('loads previous attempt and pre-populates state in review mode', async () => {
    getQuestionBySlugMock.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPreviousAttemptMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent('choice-2');
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent('attempt-1');

    expect(getPreviousAttemptMock).toHaveBeenCalledWith({
      questionId: 'question-1',
    });
  });
});
