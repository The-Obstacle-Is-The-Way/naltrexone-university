import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

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
            isOmitted: false,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onOpenReviewQuestion={onOpenReviewQuestion}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Open question' }).click();
  expect(onOpenReviewQuestion).toHaveBeenCalledWith('q1');

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});

test('renders post-exam review with score banner, feedback, and a summary exit', async () => {
  const onNavigatePostExamReviewQuestion = vi.fn();
  const onViewSummary = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      postExamSummary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      postExamReview={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'q1',
            slug: 'q-1',
            stemMd: 'Stem 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: false,
            choices: [
              { id: 'c1', label: 'A', textMd: 'Choice A' },
              { id: 'c2', label: 'B', textMd: 'Choice B' },
            ],
            selectedChoiceId: 'c1',
            correctChoiceId: 'c2',
            explanationMd: 'Because B is correct.',
            referenceMd: 'Reference 1',
            choiceExplanations: [
              {
                choiceId: 'c1',
                displayLabel: 'A',
                textMd: 'Choice A',
                isCorrect: false,
                explanationMd: 'A is not correct.',
              },
              {
                choiceId: 'c2',
                displayLabel: 'B',
                textMd: 'Choice B',
                isCorrect: true,
                explanationMd: null,
              },
            ],
          },
          {
            isAvailable: true,
            questionId: 'q2',
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
            choices: [{ id: 'c3', label: 'A', textMd: 'Choice C' }],
            selectedChoiceId: 'c3',
            correctChoiceId: 'c3',
            explanationMd: 'Because C is correct.',
            referenceMd: null,
            choiceExplanations: [
              {
                choiceId: 'c3',
                displayLabel: 'A',
                textMd: 'Choice C',
                isCorrect: true,
                explanationMd: null,
              },
            ],
          },
        ],
      }}
      examResultsSubstage="post_exam_review"
      postExamReviewLoadState={{ status: 'ready' }}
      postExamReviewCurrentQuestionId="q1"
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigatePostExamReviewQuestion={onNavigatePostExamReviewQuestion}
      onViewSummary={onViewSummary}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { level: 1, name: 'Exam complete' }))
    .toBeVisible();
  const scoreBanner = screen
    .getByText('Exam complete')
    .element()
    .closest('[data-slot="card"]');
  const scoreStat = Array.from(scoreBanner?.querySelectorAll('div') ?? []).find(
    (element) => element.textContent?.trim() === '50%',
  );
  const scoreDescription = Array.from(
    scoreBanner?.querySelectorAll('p') ?? [],
  ).find((element) => element.textContent?.includes('1 of 2 correct'));

  if (!(scoreStat instanceof HTMLElement)) {
    throw new Error('Expected score-banner stat number');
  }

  expect(scoreStat.matches('h1,h2,h3,h4,h5,h6')).toBe(false);
  expect(scoreStat.getAttribute('class')).toContain('text-3xl');
  expect(scoreStat.getAttribute('class')).toContain('font-display');
  expect(scoreDescription?.tagName).toBe('P');
  expect(scoreDescription?.textContent).toContain(
    '1 of 2 correct · Review each question with detailed feedback.',
  );
  await expect.element(screen.getByText('Because B is correct.')).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Question 2: Correct' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Try Again' }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('button', { name: 'Practice Again' }))
    .not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Next' }).click();
  expect(onNavigatePostExamReviewQuestion).toHaveBeenCalledWith('q2');

  const summaryActionBanner = screen
    .getByText('Exam complete')
    .element()
    .closest('[data-slot="card"]');
  const viewSummaryButton = Array.from(
    summaryActionBanner?.querySelectorAll('button') ?? [],
  ).find((button) => button.textContent?.trim() === 'View Summary');

  if (!(viewSummaryButton instanceof HTMLButtonElement)) {
    throw new Error('Expected score-banner View Summary button');
  }

  viewSummaryButton.click();
  expect(onViewSummary).toHaveBeenCalledTimes(1);
});

test('renders a loading state while post-exam review is hydrating inside the session route', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      postExamSummary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      examResultsSubstage="post_exam_review"
      postExamReviewLoadState={{ status: 'loading' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await expect.element(screen.getByText('Loading review...')).toBeVisible();
  await expect
    .element(screen.getByRole('heading', { name: 'Session Summary' }))
    .not.toBeInTheDocument();
});

test('renders retry and summary actions when post-exam review hydration fails', async () => {
  const onRetryPostExamReview = vi.fn();
  const onViewSummary = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      postExamSummary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      examResultsSubstage="post_exam_review"
      postExamReviewLoadState={{
        status: 'error',
        message: 'Review hydration failed',
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onRetryPostExamReview={onRetryPostExamReview}
      onViewSummary={onViewSummary}
    />,
  );

  await expect
    .element(screen.getByText('Review hydration failed'))
    .toBeVisible();

  await screen.getByRole('button', { name: 'Retry review' }).click();
  expect(onRetryPostExamReview).toHaveBeenCalledTimes(1);

  await screen.getByRole('button', { name: 'View Summary' }).click();
  expect(onViewSummary).toHaveBeenCalledTimes(1);
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
            isOmitted: false,
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
      onEndSession={onEndSession}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
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
      onEndSession={onEndSession}
      onRetryReview={onRetryReview}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await expect.element(screen.getByText('Review unavailable.')).toBeVisible();
  await screen.getByRole('button', { name: 'Try again' }).click();
  expect(onRetryReview).toHaveBeenCalledTimes(1);

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
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
      onEndSession={onEndSession}
      onFinalizeReview={onFinalizeReview}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
  expect(onEndSession).not.toHaveBeenCalled();
});
