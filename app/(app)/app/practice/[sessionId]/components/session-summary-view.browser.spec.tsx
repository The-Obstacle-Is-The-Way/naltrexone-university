import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import { SessionSummaryView } from './session-summary-view';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();

function createTutorSummary() {
  return {
    sessionId: fixtureSession1Id,
    endedAt: '2026-02-07T00:00:00.000Z',
    mode: 'tutor' as const,
    questionCount: 1,
    totals: {
      answered: 1,
      correct: 1,
      accuracy: 1,
      durationSeconds: 30,
    },
  };
}

function MountedSummaryRerenderHarness() {
  const [revision, setRevision] = useState(0);

  return (
    <>
      <SessionSummaryView
        summary={createTutorSummary()}
        review={null}
        reviewLoadState={{ status: 'idle' }}
      />
      <button type="button" onClick={() => setRevision((value) => value + 1)}>
        Keep focus here
      </button>
      <span data-testid="summary-rerender-count">{revision}</span>
    </>
  );
}

test('renders summary totals and per-question breakdown', async () => {
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'exam',
        questionCount: 10,
        totals: {
          answered: 10,
          correct: 7,
          accuracy: 0.7,
          durationSeconds: 123,
        },
      }}
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ2Id,
            order: 2,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
    />,
  );

  await expect.element(screen.getByText('Session Summary')).toBeVisible();
  await expect.element(screen.getByText('70%')).toBeVisible();
  await expect.element(screen.getByText('2m 3s')).toBeVisible();
  await expect.element(screen.getByText('Stem for q1')).toBeVisible();
  await expect
    .element(screen.getByText('[Question no longer available]'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'New Session' }))
    .toHaveAttribute('href', ROUTES.APP_PRACTICE);
  await expect
    .element(screen.getByRole('link', { name: 'Review Answers' }))
    .toHaveAttribute(
      'href',
      toQuestionRoute('q-1', {
        from: 'summary',
        mode: 'review',
        sessionId: fixtureSession1Id,
      }),
    );

  await expect
    .element(screen.getByRole('link', { name: /Stem for q1/i }))
    .toHaveAttribute(
      'href',
      toQuestionRoute('q-1', {
        from: 'summary',
        mode: 'review',
        sessionId: fixtureSession1Id,
      }),
    );
});

test('omits the removed practice-missed CTA when all exam answers are correct', async () => {
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 2,
          accuracy: 1,
          durationSeconds: 30,
        },
      }}
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
    />,
  );

  await expect
    .element(screen.getByRole('link', { name: 'Practice missed questions' }))
    .not.toBeInTheDocument();
});

test('uses New Session as the primary CTA when no reviewable slug exists', async () => {
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 30,
        },
      }}
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            order: 1,
            isAvailable: false,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
    />,
  );

  await expect
    .element(screen.getByRole('link', { name: 'Review Answers' }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('link', { name: 'New Session' }))
    .toHaveClass(/bg-primary/);
  await expect
    .element(screen.getByRole('link', { name: 'Practice missed questions' }))
    .not.toBeInTheDocument();
});

test('renders loading and error states for summary review', async () => {
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'tutor',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 30,
        },
      }}
      review={null}
      reviewLoadState={{ status: 'error', message: 'Review unavailable.' }}
    />,
  );

  await expect.element(screen.getByText('Review unavailable.')).toBeVisible();
});

test('renders only the New Session action for tutor summaries', async () => {
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'tutor',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 30,
        },
      }}
      review={null}
      reviewLoadState={{ status: 'idle' }}
    />,
  );

  await expect
    .element(screen.getByRole('link', { name: 'New Session' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Review Answers' }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('link', { name: 'Back to Dashboard' }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('link', { name: 'Start another session' }))
    .not.toBeInTheDocument();
});

test('renders callback-driven exam review controls as buttons and disables the CTA while hydrating', async () => {
  const onReviewAnswers = vi.fn();
  const onOpenReviewQuestion = vi.fn();
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 30,
        },
      }}
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ2Id,
            order: 2,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
      onReviewAnswers={onReviewAnswers}
      onOpenReviewQuestion={onOpenReviewQuestion}
      isReviewLoading={true}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Review Answers' }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole('button', { name: /Stem for q1/i }))
    .toBeDisabled();
  await expect.element(screen.getByText('Loading review...')).toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Review Answers' }))
    .not.toBeInTheDocument();
});

test('uses in-session callbacks for exam summary review re-entry when provided', async () => {
  const onReviewAnswers = vi.fn();
  const onOpenReviewQuestion = vi.fn();
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 30,
        },
      }}
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ2Id,
            order: 2,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
      onReviewAnswers={onReviewAnswers}
      onOpenReviewQuestion={onOpenReviewQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Review Answers' }).click();
  expect(onReviewAnswers).toHaveBeenCalledTimes(1);

  await screen.getByRole('button', { name: /Stem for q1/i }).click();
  expect(onOpenReviewQuestion).toHaveBeenCalledWith(fixtureQ1Id);
});

test('does not steal focus when an already-mounted summary re-renders', async () => {
  const screen = await render(<MountedSummaryRerenderHarness />);

  await screen.getByRole('button', { name: 'Keep focus here' }).click();

  await expect
    .element(screen.getByTestId('summary-rerender-count'))
    .toHaveTextContent('1');
  await expect
    .element(screen.getByRole('button', { name: 'Keep focus here' }))
    .toHaveFocus();
});
