import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import { HistorySessionsTab } from './history-sessions-tab';

const { pushMock, getPracticeSessionReviewMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getPracticeSessionReviewMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

describe('HistorySessionsTab (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
    getPracticeSessionReviewMock.mockReset();
  });

  it('clicking a session row outside nested controls navigates to review', async () => {
    const screen = await render(
      <HistorySessionsTab
        result={ok({
          rows: [
            {
              sessionId: 'session-1',
              mode: 'exam',
              questionCount: 10,
              firstQuestionSlug: 'q-1',
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

    await screen.getByRole('listitem').click();

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/app/questions/q-1'),
    );
  });

  it('supports keyboard row navigation with Enter', async () => {
    const screen = await render(
      <HistorySessionsTab
        result={ok({
          rows: [
            {
              sessionId: 'session-1',
              mode: 'exam',
              questionCount: 10,
              firstQuestionSlug: 'q-1',
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

    const row = screen.getByRole('listitem');
    const rowElement = row.element();
    rowElement.focus();
    rowElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/app/questions/q-1'),
    );
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
              firstQuestionSlug: 'q-1',
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

  it('renders a Review session action in the expanded breakdown panel', async () => {
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
              firstQuestionSlug: 'q-1',
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

    await expect
      .element(screen.getByRole('link', { name: 'Review session' }))
      .toHaveAttribute(
        'href',
        '/app/questions/q-1?from=history&mode=review&sessionId=session-1&historyHref=%2Fapp%2Fhistory%3Ftab%3Dsessions%26offset%3D0%26limit%3D20',
      );
  });

  it('threads canonical historyHref into breakdown question links', async () => {
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
              firstQuestionSlug: 'q-1',
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

    const expectedHref =
      '/app/questions/q-1?from=history&mode=review&sessionId=session-1&historyHref=%2Fapp%2Fhistory%3Ftab%3Dsessions%26offset%3D0%26limit%3D20';

    await expect
      .element(screen.getByRole('link', { name: /Stem for q1/ }))
      .toHaveAttribute('href', expectedHref);
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
              firstQuestionSlug: 'q-1',
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
              firstQuestionSlug: 'q-1',
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
              firstQuestionSlug: 'q-2',
              answered: 0,
              correct: 0,
              accuracy: 0,
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
        name: 'View breakdown for Tutor session: 0/10 correct (0%), 3m, Feb 8, 2026',
      })
      .click();
    await expect.element(screen.getByText('Stem for session 2')).toBeVisible();

    await expect
      .element(screen.getByText('Stem for session 1'))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText('Stem for session 2')).toBeVisible();
  });
});
