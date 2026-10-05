// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSessionHistoryRow,
  createUserStatsOutput,
} from '@/src/application/test-helpers/view-rows';
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
        stats={createUserStatsOutput({
          totalAnswered: 1,
          answeredLast7Days: 1,
          currentStreakDays: 1,
          recentActivity: [row],
        })}
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
      answerKeyChanged: false,
    });

    expect(doc.body.textContent).toContain(label);
    expect(doc.body.textContent).not.toContain('Hard');
  });

  // ADR-022 Decision 2: an attempt that answered nothing names the state only.
  // ADR-022 Amendment 2026-10-05 (DEBT-498): a result no score counts is
  // named, in a neutral tone, not graded.
  function resultOf(doc: Document) {
    return Array.from(doc.querySelectorAll('li span')).find((span) =>
      ['Correct', 'Incorrect', 'Not scored'].includes(span.textContent ?? ''),
    );
  }

  const answered = {
    ...shared,
    isAvailable: true as const,
    slug: 'q-1',
    stemMd: 'Answered stem',
    difficulty: 'easy' as const,
    isCorrect: true,
  };

  it.each([
    [
      'on a withdrawn question',
      { availability: 'withdrawn' as const, answerKeyChanged: false },
    ],
    [
      'under review',
      { availability: 'under_review' as const, answerKeyChanged: false },
    ],
    [
      'graded on a corrected key',
      { availability: 'available' as const, answerKeyChanged: true },
    ],
  ])('names an answer %s Not scored', (_name, marks) => {
    const result = resultOf(renderActivity({ ...answered, ...marks }));

    expect(result?.textContent).toBe('Not scored');
    expect(result?.classList.contains('text-muted-foreground')).toBe(true);
  });

  it('keeps the grade of an answer on a retired question', () => {
    const result = resultOf(
      renderActivity({
        ...answered,
        availability: 'retired',
        answerKeyChanged: false,
      }),
    );

    expect(result?.textContent).toBe('Correct');
  });

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

  // ADR-022 Decision 3: a recent session's score counts only scored items.
  it('scores a recent session over its scored items and discloses the rest', () => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <DashboardView
          stats={createUserStatsOutput()}
          sessionHistoryResult={{
            ok: true,
            data: {
              rows: [
                createSessionHistoryRow({
                  questionCount: 4,
                  answered: 4,
                  scored: 3,
                  correct: 2,
                  accuracy: 2 / 3,
                }),
              ],
              total: 1,
              limit: 3,
              offset: 0,
            },
          }}
        />,
      ),
      'text/html',
    );

    expect(doc.body.textContent).toContain('2/3 correct');
    expect(doc.body.textContent).toContain(
      "1 question isn't scored: withdrawn, under review, removed mid-session, or its answer was corrected.",
    );
  });
});
