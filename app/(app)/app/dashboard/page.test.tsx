// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DashboardView, renderDashboard } from './page';

describe('app/(app)/app/dashboard', () => {
  it('renders user stats', () => {
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
              answeredAt: '2026-02-01T00:00:00.000Z',
              questionId: 'q_1',
              sessionId: null,
              sessionMode: null,
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              isCorrect: true,
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Dashboard');
    expect(html).toContain('12');
    expect(html).toContain('75%');
    expect(html).toContain('5');
    expect(html).toContain('60%');
    expect(html).toContain('3');
    expect(html).toContain('Stem for q1');
    expect(html).not.toContain('q-1');
  });

  it('hides recent activity section when empty', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 0,
          accuracyOverall: 0,
          answeredLast7Days: 0,
          accuracyLast7Days: 0,
          currentStreakDays: 0,
          recentActivity: [],
        }}
      />,
    );

    expect(html).toContain('Dashboard');
    expect(html).not.toContain('Recent activity');
  });

  it('renders placeholder text for unavailable recent activity rows', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 1,
          accuracyOverall: 1,
          answeredLast7Days: 1,
          accuracyLast7Days: 1,
          currentStreakDays: 1,
          recentActivity: [
            {
              isAvailable: false,
              attemptId: 'attempt_1',
              answeredAt: '2026-02-01T00:00:00.000Z',
              questionId: 'q_orphaned',
              sessionId: null,
              sessionMode: null,
              isCorrect: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Incorrect');
  });

  it('groups consecutive recent activity rows by session context', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 2,
          accuracyOverall: 0.5,
          answeredLast7Days: 2,
          accuracyLast7Days: 0.5,
          currentStreakDays: 1,
          recentActivity: [
            {
              isAvailable: true,
              attemptId: 'attempt_1',
              answeredAt: '2026-02-01T00:00:00.000Z',
              questionId: 'q_1',
              sessionId: 'session_1',
              sessionMode: 'exam',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              isCorrect: true,
            },
            {
              isAvailable: true,
              attemptId: 'attempt_2',
              answeredAt: '2026-01-31T00:00:00.000Z',
              questionId: 'q_2',
              sessionId: 'session_1',
              sessionMode: 'exam',
              slug: 'q-2',
              stemMd: 'Stem for q2',
              difficulty: 'easy',
              isCorrect: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Exam session');
    expect(html).toContain('1/2 correct');
  });

  it('renders an error state when stats load fails', () => {
    const element = renderDashboard({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to load stats.');
    expect(html).toContain('Internal error');
    expect(html).toContain('Go to Practice');
  });
});
