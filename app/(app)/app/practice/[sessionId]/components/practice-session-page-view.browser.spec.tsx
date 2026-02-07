import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeSessionPageView } from './practice-session-page-view';

test('renders session summary branch when summary is present', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:00:00.000Z',
        totals: {
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
        },
      }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Session Summary')).toBeVisible();
  await expect.element(screen.getByText('80%')).toBeVisible();
});

test('renders exam review branch and triggers review actions', async () => {
  const onOpenReviewQuestion = vi.fn();
  const onFinalizeReview = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            order: 1,
            isAvailable: true,
            stemMd: 'A sample exam review question stem',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onOpenReviewQuestion={onOpenReviewQuestion}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await expect.element(screen.getByText('Review Questions')).toBeVisible();
  await screen.getByRole('button', { name: 'Open question' }).click();
  expect(onOpenReviewQuestion).toHaveBeenCalledWith('q1');

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});

test('renders active question branch with navigator and navigation callback', async () => {
  const onNavigateQuestion = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
        slug: 'q1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await expect.element(screen.getByText('Question navigator')).toBeVisible();
  await screen.getByRole('button', { name: 'Question 2: Unanswered' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q2');
});

test('renders review error actions with retry and end session escape hatch', async () => {
  const onRetryReview = vi.fn();
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      reviewLoadState={{ status: 'error', message: 'Review unavailable.' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onRetryReview={onRetryReview}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Review unavailable.')).toBeVisible();
  await screen.getByRole('button', { name: 'Try again' }).click();
  expect(onRetryReview).toHaveBeenCalledTimes(1);

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
});
