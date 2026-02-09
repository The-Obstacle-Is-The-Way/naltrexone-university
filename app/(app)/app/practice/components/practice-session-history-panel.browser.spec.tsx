import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeSessionHistoryPanel } from './practice-session-history-panel';

test('renders completed sessions and opens selected session', async () => {
  const onOpenSession = vi.fn();
  const screen = await render(
    <PracticeSessionHistoryPanel
      status="idle"
      error={null}
      rows={[
        {
          sessionId: 'session-1',
          mode: 'exam',
          questionCount: 10,
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
          startedAt: '2026-02-07T00:00:00.000Z',
          endedAt: '2026-02-07T00:20:00.000Z',
        },
      ]}
      selectedSessionId={null}
      selectedReview={null}
      reviewStatus={{ status: 'idle' }}
      onOpenSession={onOpenSession}
    />,
  );

  await expect.element(screen.getByText('Exam')).toBeVisible();
  await expect.element(screen.getByText('80%')).toBeVisible();
  await expect.element(screen.getByText('20m')).toBeVisible();
  await expect.element(screen.getByText('Feb 7, 2026')).toBeVisible();
  await screen.getByRole('button', { name: 'View breakdown' }).click();

  expect(onOpenSession).toHaveBeenCalledWith('session-1');
});

test('renders selected session breakdown and review status', async () => {
  const screen = await render(
    <PracticeSessionHistoryPanel
      status="idle"
      error={null}
      rows={[
        {
          sessionId: 'session-1',
          mode: 'exam',
          questionCount: 10,
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
          startedAt: '2026-02-07T00:00:00.000Z',
          endedAt: '2026-02-07T00:20:00.000Z',
        },
        {
          sessionId: 'session-2',
          mode: 'tutor',
          questionCount: 10,
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
          startedAt: '2026-02-08T00:00:00.000Z',
          endedAt: '2026-02-08T00:20:00.000Z',
        },
      ]}
      selectedSessionId="session-1"
      selectedReview={{
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
            stemMd: 'The patient presents with opioid withdrawal symptoms.',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: false,
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
      reviewStatus={{ status: 'ready' }}
      onOpenSession={() => undefined}
    />,
  );

  const hideBreakdownButton = screen
    .getByRole('button', { name: 'Hide breakdown' })
    .element();
  const selectedRow = hideBreakdownButton.closest('li');

  expect(selectedRow).not.toBeNull();
  expect(selectedRow?.textContent).toContain(
    'The patient presents with opioid withdrawal symptoms.',
  );
  expect(selectedRow?.textContent).toContain('[Question no longer available]');
});
