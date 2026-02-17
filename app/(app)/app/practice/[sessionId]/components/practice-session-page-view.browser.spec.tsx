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
      isAnswered={false}
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
  const onFinalizeReview = vi.fn(async () => undefined);

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
            slug: 'q-1',
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
      isAnswered={false}
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
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});

test('falls back to onEndSession when onFinalizeReview is omitted in the review stage', async () => {
  const onEndSession = vi.fn();

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
            slug: 'q-1',
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
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Review Questions')).toBeVisible();
  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
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
            slug: 'q-1',
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
            slug: 'q-2',
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
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
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

  await expect.element(screen.getByText('Exam Session')).toBeVisible();
  await expect
    .element(
      screen.getByText(
        'Question 1 of 2 — Explanations shown after you submit the exam.',
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText('Question navigator')).toBeVisible();
  await screen.getByRole('button', { name: 'Question 2: Unanswered' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q2');
});

test('renders Previous button in the session answering branch', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
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
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
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
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: '← Previous' }))
    .toBeVisible();
});

test('hasPreviousQuestion is false when current question is first in navigator', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
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
        mode: 'tutor',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
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
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: '← Previous' }))
    .toBeDisabled();
});

test('hasPreviousQuestion is false when navigator is missing or current question is not found', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q-missing',
        slug: 'q-missing',
        stemMd: 'Stem missing',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
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
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: '← Previous' }))
    .toBeDisabled();
});

test('hasPreviousQuestion is true when current question is not first', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
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
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
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
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: '← Previous' }))
    .not.toBeDisabled();
});

test("clicking Previous calls onNavigateQuestion with the previous question's ID", async () => {
  const onNavigateQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
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
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
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
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: '← Previous' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q1');
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
      isAnswered={false}
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

test('renders navigator error with retry action', async () => {
  const onRetryNavigator = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      navigatorLoadState={{
        status: 'error',
        message: 'Navigator unavailable.',
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onRetryNavigator={onRetryNavigator}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByText('Navigator unavailable.'))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Retry navigator' }).click();
  expect(onRetryNavigator).toHaveBeenCalledTimes(1);
});

test('calls onFinalizeReview instead of onEndSession when both are provided', async () => {
  const onFinalizeReview = vi.fn(async () => undefined);
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
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onFinalizeReview={onFinalizeReview}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
  expect(onEndSession).not.toHaveBeenCalled();
});
