// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GetAttemptedQuestionsOutput } from '@/src/adapters/controllers/review-controller';
import { createAvailableAttemptedQuestionRow } from '@/src/application/test-helpers/view-rows';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let HistoryQuestionsTab: typeof import('./history-questions-tab').HistoryQuestionsTab;

beforeAll(async () => {
  ({ HistoryQuestionsTab } = await import('./history-questions-tab'));
});

function renderRows(rows: GetAttemptedQuestionsOutput['rows']) {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <HistoryQuestionsTab
        result={{
          ok: true,
          data: { rows, totalCount: rows.length, limit: 20, offset: 0 },
        }}
      />,
    ),
    'text/html',
  );
}

// ADR-022 Decision 1: each state has its own label, in place of difficulty.
describe('HistoryQuestionsTab: question availability', () => {
  it.each([
    ['under_review', 'Under review'],
    ['retired', 'Retired'],
  ] as const)('labels an answered %s question %s', (availability, label) => {
    const doc = renderRows([
      createAvailableAttemptedQuestionRow({ availability, difficulty: 'hard' }),
    ]);
    const labelSpan = Array.from(doc.querySelectorAll('span')).find(
      (span) => span.textContent === label,
    );

    expect(labelSpan).toBeDefined();
    // The label keeps its own case: only a difficulty is capitalized.
    expect(labelSpan?.classList.contains('capitalize')).toBe(false);
    expect(doc.body.textContent?.toLowerCase()).not.toContain('hard');
  });

  // ADR-022 Decision 2: an attempt that answered nothing names the state only.
  it('names the state of an omitted attempt, in place of the generic text', () => {
    const doc = renderRows([
      {
        isAvailable: false,
        availability: 'retired',
        questionId: crypto.randomUUID(),
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
        lastAnsweredAt: '2026-02-01T00:00:00.000Z',
      },
    ]);

    expect(doc.body.textContent).toContain(
      'This question has been retired from the bank.',
    );
    expect(doc.body.textContent).toContain('Retired');
    expect(doc.body.textContent).not.toContain(
      '[Question no longer available]',
    );
    expect(doc.body.textContent).not.toContain('removed or unpublished');
    expect(doc.querySelectorAll('a[href*="/app/questions/"]')).toHaveLength(0);
  });
});
