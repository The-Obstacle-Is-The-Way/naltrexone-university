import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { SessionSummaryView } from './session-summary-view';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

test('renders summary totals and per-question breakdown', async () => {
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:00:00.000Z',
        totals: {
          answered: 10,
          correct: 7,
          accuracy: 0.7,
          durationSeconds: 123,
        },
      }}
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            order: 2,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
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
    .element(screen.getByRole('link', { name: 'Back to Dashboard' }))
    .toHaveAttribute('href', '/app/dashboard');
});

test('renders loading and error states for summary review', async () => {
  const screen = await render(
    <SessionSummaryView
      summary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:00:00.000Z',
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
