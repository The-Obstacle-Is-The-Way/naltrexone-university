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

// ADR-022 Amendment 2026-10-05 (DEBT-498): a result no score counts reads
// "Not scored", in the row's muted tone, in place of Correct or Incorrect.
describe('HistoryQuestionsTab: results no score counts', () => {
  function resultOf(doc: Document) {
    return Array.from(doc.querySelectorAll('span')).find((span) =>
      ['Correct', 'Incorrect', 'Not scored'].includes(span.textContent ?? ''),
    );
  }

  function expectNotScored(doc: Document) {
    const result = resultOf(doc);
    expect(result?.textContent).toBe('Not scored');
    expect(result?.classList.contains('text-muted-foreground')).toBe(true);
    expect(result?.classList.contains('text-success')).toBe(false);
    expect(result?.classList.contains('text-destructive')).toBe(false);
  }

  it.each([
    ['on a withdrawn question', { availability: 'withdrawn' }],
    ['on a question under review', { availability: 'under_review' }],
    ['graded on a key corrected since', { answerKeyChanged: true }],
  ] as const)('names an answer %s Not scored', (_name, marks) => {
    expectNotScored(
      renderRows([
        createAvailableAttemptedQuestionRow({ isCorrect: true, ...marks }),
      ]),
    );
  });

  it('keeps the grade of an answer on a retired question', () => {
    const result = resultOf(
      renderRows([
        createAvailableAttemptedQuestionRow({
          availability: 'retired',
          isCorrect: true,
        }),
      ]),
    );

    expect(result?.textContent).toBe('Correct');
    expect(result?.classList.contains('text-success')).toBe(true);
  });

  it.each([
    ['withdrawn', 'withdrawn'],
    ['under review', 'under_review'],
    ['that no longer exists', null],
  ] as const)(
    'names an omitted attempt on a question %s Not scored',
    (_name, availability) => {
      expectNotScored(
        renderRows([
          {
            isAvailable: false,
            availability,
            questionId: crypto.randomUUID(),
            isCorrect: false,
            sessionId: null,
            sessionMode: null,
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]),
      );
    },
  );

  it('keeps the grade of an omitted attempt on a retired question', () => {
    const result = resultOf(
      renderRows([
        {
          isAvailable: false,
          availability: 'retired',
          questionId: crypto.randomUUID(),
          isCorrect: false,
          sessionId: null,
          sessionMode: null,
          lastAnsweredAt: '2026-02-01T00:00:00.000Z',
        },
      ]),
    );

    expect(result?.textContent).toBe('Incorrect');
    expect(result?.classList.contains('text-destructive')).toBe(true);
  });
});
