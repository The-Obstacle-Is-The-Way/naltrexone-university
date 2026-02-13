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

const { getPracticeSessionReviewMock } = vi.hoisted(() => ({
  getPracticeSessionReviewMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/question-view-controller', () => ({
  getQuestionBySlug: getQuestionBySlugMock,
  getPreviousAttempt: getPreviousAttemptMock,
}));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  submitAnswer: submitAnswerMock,
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

function Probe({
  mode,
  sessionId,
  attemptId,
}: {
  mode?: 'review' | null;
  sessionId?: string;
  attemptId?: string;
}) {
  const output = useQuestionPageController({
    slug: 'q-1',
    mode,
    sessionId,
    attemptId,
  });

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
    getPracticeSessionReviewMock.mockReset();
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

  it('passes attemptId and sessionId to getPreviousAttempt in review mode when provided', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000003';
    const sessionId = '00000000-0000-4000-8000-000000000004';

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

    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }),
    );

    getPreviousAttemptMock.mockResolvedValue(
      ok({
        attemptId,
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(
      <Probe mode="review" attemptId={attemptId} sessionId={sessionId} />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    expect(getPreviousAttemptMock).toHaveBeenCalledWith({
      questionId: 'question-1',
      attemptId,
      sessionId,
    });
  });

  it('fetches the session review when sessionId is provided', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';

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

    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: 'question-2',
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }),
    );

    const screen = await render(<Probe sessionId={sessionId} />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    expect(getPracticeSessionReviewMock).toHaveBeenCalledWith({ sessionId });
  });
});
