import { useCallback, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-model.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();

const examQuestionNavigator = createReviewResponse({
  mode: 'exam',
  totalCount: 2,
  answeredCount: 0,
  markedCount: 0,
  rows: [
    createReviewRow({
      questionId: fixtureQ1Id,
      slug: 'q-1',
      order: 1,
      isAnswered: false,
      isCorrect: null,
    }),
    createReviewRow({
      questionId: fixtureQ2Id,
      slug: 'q-2',
      order: 2,
      isAnswered: false,
      isCorrect: null,
    }),
  ],
});

function renderQuestionNavigationHarness() {
  function Harness() {
    const [questionIndex, setQuestionIndex] = useState(0);
    const handleNextQuestion = useCallback(() => {
      setQuestionIndex((current) => Math.min(current + 1, 1));
    }, []);
    const handleNavigateQuestion = useCallback((nextQuestionId: string) => {
      if (nextQuestionId === fixtureQ1Id) {
        setQuestionIndex(0);
        return;
      }

      if (nextQuestionId === fixtureQ2Id) {
        setQuestionIndex(1);
        return;
      }

      throw new Error(`Unexpected question id: ${nextQuestionId}`);
    }, []);

    const questionId = questionIndex === 0 ? fixtureQ1Id : fixtureQ2Id;
    const stem = questionIndex === 0 ? 'Stem 1' : 'Stem 2';

    return (
      <PracticeSessionPageView
        summary={null}
        review={null}
        navigator={examQuestionNavigator}
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'exam',
          deadlineAt: '2099-05-22T12:02:24.000Z',
          index: questionIndex,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={createNextQuestion({
          questionId,
          slug: questionId,
          stemMd: stem,
          difficulty: 'easy',
        })}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={noop}
        onTryAgain={noop}
        onToggleBookmark={noop}
        onToggleMarkForReview={noop}
        onSelectChoice={noop}
        onNextQuestion={handleNextQuestion}
        onNavigateQuestion={handleNavigateQuestion}
      />
    );
  }

  return render(<Harness />);
}

test('scrolls the question panel into view and restores focus after next and previous navigation', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(noop);

  try {
    const screen = await renderQuestionNavigationHarness();

    const getQuestionPanel = () =>
      document.querySelector<HTMLElement>(
        '[data-testid="active-question-panel"]',
      );

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    await screen.getByRole('button', { name: 'Next' }).click();

    await expect.element(screen.getByText('Stem 2')).toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );

    scrollIntoViewSpy.mockClear();

    await screen.getByRole('button', { name: 'Previous' }).click();

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('restores the question panel when next-question navigation enters loading before the question id changes', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(noop);

  try {
    function Harness() {
      const [loadState, setLoadState] = useState<{
        status: 'ready' | 'loading';
      }>({ status: 'ready' });
      const [question, setQuestion] = useState<ReturnType<
        typeof createNextQuestion
      > | null>(
        createNextQuestion({
          questionId: fixtureQ1Id,
          slug: 'q1',
          stemMd: 'Stem 1',
          difficulty: 'easy',
        }),
      );

      const handleNavigateQuestion = useCallback(() => {
        setQuestion(null);
        setLoadState({ status: 'loading' });
      }, []);

      return (
        <PracticeSessionPageView
          summary={null}
          review={null}
          navigator={examQuestionNavigator}
          sessionInfo={{
            sessionId: fixtureSession1Id,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          }}
          loadState={loadState}
          question={question}
          selectedChoiceId={null}
          isAnswered={false}
          submitResult={null}
          isPending={false}
          bookmarkStatus="idle"
          isBookmarked={false}
          onEndSession={noop}
          onTryAgain={noop}
          onToggleBookmark={noop}
          onToggleMarkForReview={noop}
          onSelectChoice={noop}
          onNextQuestion={noop}
          onNavigateQuestion={handleNavigateQuestion}
        />
      );
    }

    const screen = await render(<Harness />);
    const getQuestionPanel = () =>
      document.querySelector<HTMLElement>(
        '[data-testid="active-question-panel"]',
      );

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    await screen.getByRole('button', { name: 'Next' }).click();

    await expect.element(screen.getByText('Loading question…')).toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('restores the question panel when navigation fails before the question id changes', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(noop);

  try {
    function Harness() {
      const [loadState, setLoadState] = useState<
        { status: 'ready' } | { status: 'error'; message: string }
      >({ status: 'ready' });
      const question = createNextQuestion({
        questionId: fixtureQ1Id,
        slug: 'q1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
      });

      const handleNavigateQuestion = useCallback(() => {
        setLoadState({
          status: 'error',
          message: 'Failed to load the next question.',
        });
      }, []);

      return (
        <PracticeSessionPageView
          summary={null}
          review={null}
          navigator={examQuestionNavigator}
          sessionInfo={{
            sessionId: fixtureSession1Id,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          }}
          loadState={loadState}
          question={question}
          selectedChoiceId={null}
          isAnswered={false}
          submitResult={null}
          isPending={false}
          bookmarkStatus="idle"
          isBookmarked={false}
          onEndSession={noop}
          onTryAgain={noop}
          onToggleBookmark={noop}
          onToggleMarkForReview={noop}
          onSelectChoice={noop}
          onNextQuestion={noop}
          onNavigateQuestion={handleNavigateQuestion}
        />
      );
    }

    const screen = await render(<Harness />);
    const getQuestionPanel = () =>
      document.querySelector<HTMLElement>(
        '[data-testid="active-question-panel"]',
      );

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    await screen.getByRole('button', { name: 'Next' }).click();

    await expect
      .element(screen.getByText('Failed to load the next question.'))
      .toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('restores the question panel when retrying from an in-panel load error', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(noop);

  try {
    function Harness() {
      const [loadState, setLoadState] = useState<
        { status: 'error'; message: string } | { status: 'loading' }
      >({
        status: 'error',
        message: 'Failed to reload the question.',
      });
      const question = createNextQuestion({
        questionId: fixtureQ1Id,
        slug: 'q1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
      });

      const handleTryAgain = useCallback(() => {
        setLoadState({ status: 'loading' });
      }, []);

      return (
        <PracticeSessionPageView
          summary={null}
          review={null}
          navigator={examQuestionNavigator}
          sessionInfo={{
            sessionId: fixtureSession1Id,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          }}
          loadState={loadState}
          question={question}
          selectedChoiceId={null}
          isAnswered={false}
          submitResult={null}
          isPending={false}
          bookmarkStatus="idle"
          isBookmarked={false}
          onEndSession={noop}
          onTryAgain={handleTryAgain}
          onToggleBookmark={noop}
          onToggleMarkForReview={noop}
          onSelectChoice={noop}
          onNextQuestion={noop}
        />
      );
    }

    const screen = await render(<Harness />);
    const getQuestionPanel = () =>
      document.querySelector<HTMLElement>(
        '[data-testid="active-question-panel"]',
      );

    await expect
      .element(screen.getByText('Failed to reload the question.'))
      .toBeVisible();
    scrollIntoViewSpy.mockClear();

    await screen.getByRole('button', { name: 'Try again' }).click();

    await expect.element(screen.getByText('Loading question…')).toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});
