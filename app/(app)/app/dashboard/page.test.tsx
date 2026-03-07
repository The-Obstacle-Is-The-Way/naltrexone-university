// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import { DashboardView, renderDashboard } from './page';

function findStatValue(doc: Document, label: string): string | null {
  const labelEl =
    Array.from(doc.querySelectorAll('div')).find(
      (el) => el.textContent === label,
    ) ?? null;
  return labelEl?.nextElementSibling?.textContent ?? null;
}

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('app/(app)/app/dashboard', () => {
  it('renders page subtitle with explicit text-base sizing', () => {
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
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const subtitle = Array.from(doc.querySelectorAll('p')).find((element) =>
      element.textContent?.includes(
        'Track your progress and keep your streak alive.',
      ),
    );
    const subtitleClassTokens = getClassTokens(
      subtitle?.getAttribute('class') ?? '',
    );

    expect(subtitle).not.toBeNull();
    expect(subtitleClassTokens.has('text-base')).toBe(true);
    expect(subtitleClassTokens.has('text-muted-foreground')).toBe(true);
  });

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
                firstQuestionSlug: 'q-correct',
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

  it('renders — for accuracy when there are no attempts', () => {
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
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(findStatValue(doc, 'Overall accuracy')).toBe('—');
    expect(findStatValue(doc, 'Accuracy (7 days)')).toBe('—');
  });

  it('renders a per-session review link when firstQuestionSlug is available', () => {
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
        sessionHistoryResult={{
          ok: true,
          data: {
            rows: [
              {
                sessionId: 'session_1',
                mode: 'exam',
                questionCount: 20,
                firstQuestionSlug: 'q-correct',
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

    expect(
      doc.querySelector(
        `a[href="${toQuestionRoute('q-correct', {
          from: 'dashboard',
          mode: 'review',
          sessionId: 'session_1',
        })}"]`,
      ),
    ).not.toBeNull();
  });

  it('falls back to history sessions link when firstQuestionSlug is null', () => {
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
        sessionHistoryResult={{
          ok: true,
          data: {
            rows: [
              {
                sessionId: 'session_1',
                mode: 'exam',
                questionCount: 20,
                firstQuestionSlug: null,
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

    // Scope to `li a` to target the session card link, not the "View all" header link
    expect(
      doc.querySelector(`li a[href="${ROUTES.APP_HISTORY}?tab=sessions"]`),
    ).not.toBeNull();
  });

  it('renders tutor session fraction using questionCount denominator', () => {
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
        sessionHistoryResult={{
          ok: true,
          data: {
            rows: [
              {
                sessionId: 'session_1',
                mode: 'tutor',
                questionCount: 5,
                firstQuestionSlug: 'q-correct',
                answered: 2,
                correct: 2,
                accuracy: 0.4,
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

    expect(html).toContain('2/5 correct');
    expect(html).not.toContain('2/2 correct');
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

  it('uses stronger dark-mode row boundary tokens for dashboard activity/session rows', () => {
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
              isAvailable: false,
              attemptId: 'attempt_2',
              answeredAt: '2026-02-03T00:00:00.000Z',
              questionId: 'q_unavailable',
              sessionId: null,
              sessionMode: null,
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
                firstQuestionSlug: 'q-correct',
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
    const sessionRow = doc.querySelector(
      `a[href="${toQuestionRoute('q-correct', {
        from: 'dashboard',
        mode: 'review',
        sessionId: 'session_1',
      })}"]`,
    );
    const availableActivityRow = doc.querySelector(
      `a[href="${toQuestionRoute('q-correct', {
        from: 'dashboard',
        mode: 'review',
        attemptId: 'attempt_1',
      })}"]`,
    );
    const unavailableActivityCard = Array.from(
      doc.querySelectorAll('li > div'),
    ).find((element) =>
      element.textContent?.includes('[Question no longer available]'),
    );
    const sessionRowTokens = getClassTokens(
      sessionRow?.getAttribute('class') ?? '',
    );
    const availableActivityRowTokens = getClassTokens(
      availableActivityRow?.getAttribute('class') ?? '',
    );
    const unavailableActivityCardTokens = getClassTokens(
      unavailableActivityCard?.getAttribute('class') ?? '',
    );

    expect(sessionRow).not.toBeNull();
    expect(availableActivityRow).not.toBeNull();
    expect(unavailableActivityCard).not.toBeNull();
    expect(sessionRowTokens.has('rounded-xl')).toBe(true);
    expect(availableActivityRowTokens.has('rounded-xl')).toBe(true);
    expect(unavailableActivityCardTokens.has('rounded-xl')).toBe(true);
    expect(unavailableActivityCardTokens.has('border-border/60')).toBe(true);
    expect(sessionRowTokens.has('dark:border-foreground/40')).toBe(true);
    expect(sessionRowTokens.has('dark:hover:border-foreground/70')).toBe(true);
    expect(availableActivityRowTokens.has('dark:border-foreground/40')).toBe(
      true,
    );
    expect(
      availableActivityRowTokens.has('dark:hover:border-foreground/70'),
    ).toBe(true);
    expect(unavailableActivityCardTokens.has('dark:border-foreground/40')).toBe(
      true,
    );
    expect(
      unavailableActivityCardTokens.has('dark:hover:border-foreground/70'),
    ).toBe(false);
  });
});
