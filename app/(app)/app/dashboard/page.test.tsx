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
          recentActivity: [],
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
        missedQuestionsResult={{
          ok: true,
          data: {
            rows: [
              {
                isAvailable: true,
                questionId: 'q_1',
                sessionId: null,
                sessionMode: null,
                slug: 'q-1',
                stemMd: 'Stem for q1',
                difficulty: 'easy',
                tagSlugs: [],
                lastAnsweredAt: '2026-02-02T00:00:00.000Z',
              },
            ],
            limit: 3,
            offset: 0,
            totalCount: 1,
          },
        }}
      />,
    );

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
    expect(html).toContain('Recent missed');
    expect(html).toContain('Stem for q1');
    expect(html).toContain(
      `href="${toQuestionRoute('q-1', { from: 'dashboard' })}"`,
    );
    expect(html).toContain('Easy');
    expect(html).not.toContain('Recent activity');
  });

  it('renders placeholder text for unavailable missed question rows', () => {
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
        missedQuestionsResult={{
          ok: true,
          data: {
            rows: [
              {
                isAvailable: false,
                questionId: 'q_orphaned',
                sessionId: null,
                sessionMode: null,
                lastAnsweredAt: '2026-02-01T00:00:00.000Z',
              },
            ],
            limit: 3,
            offset: 0,
            totalCount: 1,
          },
        }}
      />,
    );

    expect(html).toContain('[Question no longer available]');
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
        missedQuestionsResult={{
          ok: true,
          data: { rows: [], limit: 3, offset: 0, totalCount: 0 },
        }}
      />,
    );

    expect(html).toContain('Sessions failed');
    expect(html).toContain('Recent sessions');
  });

  it('renders per-section error when missedQuestionsResult fails', () => {
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
        missedQuestionsResult={{
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Missed questions failed' },
        }}
      />,
    );

    expect(html).toContain('Missed questions failed');
    expect(html).toContain('Recent missed');
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
      missedQuestionsResult: {
        ok: true,
        data: { rows: [], limit: 3, offset: 0, totalCount: 0 },
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to load stats.');
    expect(html).toContain('Internal error');
    expect(html).toContain('Go to Practice');
  });
});
