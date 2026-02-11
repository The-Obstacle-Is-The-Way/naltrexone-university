import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import { HistorySessionsTab } from './history-sessions-tab';

const { getPracticeSessionReviewMock } = vi.hoisted(() => ({
  getPracticeSessionReviewMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

describe('HistorySessionsTab (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getPracticeSessionReviewMock.mockReset();
  });

  it('clicking View breakdown loads and renders breakdown rows', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
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
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }),
    );

    const screen = await render(
      <HistorySessionsTab
        result={ok({
          rows: [
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
          ],
          total: 1,
          limit: 20,
          offset: 0,
        })}
      />,
    );

    await screen.getByRole('button', { name: 'View breakdown' }).click();

    expect(getPracticeSessionReviewMock).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });

    await expect.element(screen.getByText('Stem for q1')).toBeVisible();
  });

  it('clicking Hide breakdown collapses the selected session', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
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
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }),
    );

    const screen = await render(
      <HistorySessionsTab
        result={ok({
          rows: [
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
          ],
          total: 1,
          limit: 20,
          offset: 0,
        })}
      />,
    );

    await screen.getByRole('button', { name: 'View breakdown' }).click();
    await expect.element(screen.getByText('Stem for q1')).toBeVisible();

    await screen.getByRole('button', { name: 'Hide breakdown' }).click();

    await expect
      .element(screen.getByText('Stem for q1'))
      .not.toBeInTheDocument();
  });

  it('clicking a different session collapses the previous breakdown', async () => {
    getPracticeSessionReviewMock.mockImplementation(async (input) => {
      const sessionId = (input as { sessionId: string }).sessionId;
      if (sessionId === 'session-1') {
        return ok({
          sessionId,
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
              stemMd: 'Stem for session 1',
              difficulty: 'easy',
              isAnswered: true,
              isCorrect: false,
              markedForReview: false,
            },
          ],
        });
      }

      return ok({
        sessionId,
        mode: 'tutor',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem for session 2',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      });
    });

    const screen = await render(
      <HistorySessionsTab
        result={ok({
          rows: [
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
              correct: 7,
              accuracy: 0.7,
              durationSeconds: 180,
              startedAt: '2026-02-08T00:00:00.000Z',
              endedAt: '2026-02-08T00:03:00.000Z',
            },
          ],
          total: 2,
          limit: 20,
          offset: 0,
        })}
      />,
    );

    await screen
      .getByRole('button', {
        name: 'View breakdown for Exam session: 8/10 correct (80%), 20m, Feb 7, 2026',
      })
      .click();
    await expect.element(screen.getByText('Stem for session 1')).toBeVisible();

    await screen
      .getByRole('button', {
        name: 'View breakdown for Tutor session: 7/10 correct (70%), 3m, Feb 8, 2026',
      })
      .click();
    await expect.element(screen.getByText('Stem for session 2')).toBeVisible();

    await expect
      .element(screen.getByText('Stem for session 1'))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText('Stem for session 2')).toBeVisible();
  });
});
