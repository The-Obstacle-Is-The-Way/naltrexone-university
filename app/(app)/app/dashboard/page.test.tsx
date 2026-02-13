// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import { DashboardView, renderDashboard } from './page';

describe('app/(app)/app/dashboard', () => {
  it('renders user stats and recent sections', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 12,
          accuracyOverall: 0.75,
          answeredLast7Days: 5,
          accuracyLast7Days: 0.6,
          currentStreakDays: 3,
          recentActivity: [
            {
              isAvailable: true,
              attemptId: 'attempt_1',
              answeredAt: '2026-02-02T00:00:00.000Z',
              questionId: 'q_correct',
              sessionId: null,
              sessionMode: null,
              slug: 'q-correct',
              stemMd: 'Stem for correct',
              difficulty: 'easy',
              isCorrect: true,
            },
            {
              isAvailable: true,
              attemptId: 'attempt_2',
              answeredAt: '2026-02-03T00:00:00.000Z',
              questionId: 'q_incorrect',
              sessionId: null,
              sessionMode: null,
              slug: 'q-incorrect',
              stemMd: 'Stem for incorrect',
              difficulty: 'hard',
              isCorrect: false,
            },
          ],
        }}
        sessionHistoryResult={{
          ok: true,
          data: {
            rows: [
              {
                sessionId: 'session_1',
                mode: 'exam',
                questionCount: 20,
                answered: 20,
                correct: 15,
                accuracy: 0.75,
                durationSeconds: 1800,
                startedAt: '2026-02-01T00:00:00.000Z',
                endedAt: '2026-02-01T00:30:00.000Z',
              },
            ],
            total: 1,
            limit: 3,
            offset: 0,
          },
        }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(html).toContain('Dashboard');
    expect(html).toContain('12');
    expect(html).toContain('75%');
    expect(html).toContain('5');
    expect(html).toContain('60%');
    expect(html).toContain('3');
    expect(html).toContain('Recent sessions');
    expect(html).toContain(`href="${ROUTES.APP_HISTORY}?tab=sessions"`);
    expect(html).toContain('Exam');
    expect(html).toContain('15/20 correct');
    expect(html).toContain('Feb 1, 2026');
    expect(html).toContain('Recent activity');
    expect(html).toContain(`href="${ROUTES.APP_HISTORY}?tab=questions"`);
    expect(html).toContain('Stem for correct');
    expect(html).toContain('Stem for incorrect');
    expect(
      doc.querySelector(
        `a[href="${toQuestionRoute('q-correct', {
          from: 'dashboard',
          mode: 'review',
          attemptId: 'attempt_1',
        })}"]`,
      ),
    ).not.toBeNull();
    expect(
      doc.querySelector(
        `a[href="${toQuestionRoute('q-incorrect', {
          from: 'dashboard',
          mode: 'review',
          attemptId: 'attempt_2',
        })}"]`,
      ),
    ).not.toBeNull();
    expect(html).toContain('Easy');
    expect(html).toContain('Hard');
    expect(html).toContain('Correct');
    expect(html).toContain('Incorrect');
    expect(html).toContain('Answered Feb 2, 2026');
    expect(html).toContain('Answered Feb 3, 2026');
    expect(html).not.toContain('Recent missed');
  });

  it('renders placeholder text for unavailable recent activity rows', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 2,
          accuracyOverall: 1,
          answeredLast7Days: 2,
          accuracyLast7Days: 1,
          currentStreakDays: 1,
          recentActivity: [
            {
              isAvailable: false,
              attemptId: 'attempt_unavailable_incorrect',
              answeredAt: '2026-02-01T00:00:00.000Z',
              questionId: 'q_orphaned',
              sessionId: null,
              sessionMode: null,
              isCorrect: false,
            },
            {
              isAvailable: false,
              attemptId: 'attempt_unavailable_correct',
              answeredAt: '2026-02-02T00:00:00.000Z',
              questionId: 'q_orphaned_2',
              sessionId: null,
              sessionMode: null,
              isCorrect: true,
            },
          ],
        }}
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    );

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Incorrect');
    expect(html).toContain('Correct');
  });

  it('renders per-section error when sessionHistoryResult fails', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 1,
          accuracyOverall: 1,
          answeredLast7Days: 1,
          accuracyLast7Days: 1,
          currentStreakDays: 1,
          recentActivity: [],
        }}
        sessionHistoryResult={{
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Sessions failed' },
        }}
      />,
    );

    expect(html).toContain('Sessions failed');
    expect(html).toContain('Recent sessions');
  });

  it('renders empty state when there is no recent activity', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 1,
          accuracyOverall: 1,
          answeredLast7Days: 1,
          accuracyLast7Days: 1,
          currentStreakDays: 1,
          recentActivity: [],
        }}
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    );

    expect(html).toContain('Recent activity');
    expect(html).toContain('No questions attempted yet.');
  });

  it('renders an error state when stats load fails', () => {
    const element = renderDashboard({
      statsResult: {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
      },
      sessionHistoryResult: {
        ok: true,
        data: { rows: [], total: 0, limit: 3, offset: 0 },
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to load stats.');
    expect(html).toContain('Internal error');
    expect(html).toContain('Go to Practice');
  });
});
