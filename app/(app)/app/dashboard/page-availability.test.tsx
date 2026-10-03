// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { UserStatsOutput } from '@/src/application/use-cases';

let DashboardView: typeof import('./page').DashboardView;

beforeAll(async () => {
  ({ DashboardView } = await import('./page'));
});

type ActivityRow = UserStatsOutput['recentActivity'][number];

function renderActivity(row: ActivityRow) {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 1,
          accuracyOverall: 0,
          answeredLast7Days: 1,
          accuracyLast7Days: 0,
          currentStreakDays: 1,
          recentActivity: [row],
        }}
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    ),
    'text/html',
  );
}

const shared = {
  attemptId: crypto.randomUUID(),
  answeredAt: '2026-02-01T00:00:00.000Z',
  questionId: crypto.randomUUID(),
  sessionId: null,
  sessionMode: null,
  isCorrect: false,
};

// ADR-022 Decision 1: each state has its own label, in place of difficulty.
describe('Dashboard recent activity: question availability', () => {
  it.each([
    ['under_review', 'Under review'],
    ['retired', 'Retired'],
  ] as const)('labels an answered %s question %s', (availability, label) => {
    const doc = renderActivity({
      ...shared,
      isAvailable: true,
      availability,
      slug: 'q-held',
      stemMd: 'Answered stem',
      difficulty: 'hard',
    });

    expect(doc.body.textContent).toContain(label);
    expect(doc.body.textContent).not.toContain('Hard');
  });

  // ADR-022 Decision 2: an attempt that answered nothing names the state only.
  it('names the state of an omitted attempt, in place of the generic text', () => {
    const doc = renderActivity({
      ...shared,
      isAvailable: false,
      availability: 'withdrawn',
    });

    expect(doc.body.textContent).toContain('This question was withdrawn.');
    expect(doc.body.textContent).not.toContain(
      '[Question no longer available]',
    );
    expect(doc.querySelectorAll('a[href*="q-held"]')).toHaveLength(0);
  });
});
