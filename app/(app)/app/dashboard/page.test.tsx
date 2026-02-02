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
              answeredAt: '2026-02-01T00:00:00.000Z',
              questionId: 'q_1',
              slug: 'q-1',
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
    expect(html).toContain('q-1');
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
