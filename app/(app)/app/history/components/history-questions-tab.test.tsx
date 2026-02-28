// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildHistoryQuestionsHref,
  type QuestionsFilters,
} from '@/app/(app)/app/history/history-search-params';
import { toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetAttemptedQuestionsOutput } from '@/src/adapters/controllers/review-controller';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let HistoryQuestionsTab: typeof import('./history-questions-tab').HistoryQuestionsTab;

beforeAll(async () => {
  const module = await import('./history-questions-tab');
  HistoryQuestionsTab = module.HistoryQuestionsTab;
});

type AttemptedQuestionRow = GetAttemptedQuestionsOutput['rows'][number];
type AvailableAttemptedQuestionRow = Extract<
  AttemptedQuestionRow,
  { isAvailable: true }
>;

function createAvailableAttemptedQuestionRow(
  overrides: Partial<AvailableAttemptedQuestionRow> = {},
): AvailableAttemptedQuestionRow {
  return {
    isAvailable: true,
    questionId: 'q_1',
    isCorrect: false,
    sessionId: null,
    sessionMode: null,
    slug: 'q-1',
    stemMd: 'Stem for q1',
    difficulty: 'easy',
    tagSlugs: [],
    lastAnsweredAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('HistoryQuestionsTab', () => {
  it('renders attempted question cards as single Link-as-Card rows with expected metadata', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: 'q_correct',
            isCorrect: true,
            sessionId: 'session-1',
            sessionMode: 'exam',
            slug: 'q-correct',
            stemMd: 'Stem for correct',
            tagSlugs: ['opioids'],
          }),
          createAvailableAttemptedQuestionRow({
            questionId: 'q_incorrect',
            slug: 'q-incorrect',
            stemMd: 'Stem for incorrect',
            difficulty: 'hard',
            lastAnsweredAt: '2026-02-02T00:00:00.000Z',
          }),
        ],
        totalCount: 2,
        limit: 20,
        offset: 0,
      },
    };

    const filters: QuestionsFilters = {
      difficulty: 'hard',
      tagSlug: 'opioids',
      result: 'incorrect',
    };

    const html = renderToStaticMarkup(
      <HistoryQuestionsTab result={result} filters={filters} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(html).toContain('Stem for correct');
    expect(html).toContain('Stem for incorrect');
    expect(html).toContain('Correct');
    expect(html).toContain('Incorrect');
    expect(html).toContain('easy');
    expect(html).toContain('hard');
    expect(html).toContain('Feb 1, 2026');
    expect(html).toContain('Exam session');
    expect(html).toContain('Ad-hoc practice');
    expect(html).toContain('Review');
    expect(html).not.toContain('Reattempt');

    const historyHref = buildHistoryQuestionsHref({
      limit: result.data.limit,
      offset: result.data.offset,
      filters,
    });

    const correctHref = toQuestionRoute('q-correct', {
      from: 'history',
      mode: 'review',
      historyHref,
    });
    const incorrectHref = toQuestionRoute('q-incorrect', {
      from: 'history',
      mode: 'review',
      historyHref,
    });

    const hrefs = Array.from(doc.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.filter((href) => href === correctHref)).toHaveLength(1);
    expect(hrefs.filter((href) => href === incorrectHref)).toHaveLength(1);

    const correctLinks = hrefs.filter((href) =>
      href?.startsWith('/app/questions/q-correct?'),
    );
    const incorrectLinks = hrefs.filter((href) =>
      href?.startsWith('/app/questions/q-incorrect?'),
    );

    expect(correctLinks.every((href) => !href?.includes('historySeq='))).toBe(
      true,
    );
    expect(
      incorrectLinks.every((href) => !href?.includes('historyIndex=')),
    ).toBe(true);

    const reviewAnchors = Array.from(doc.querySelectorAll('a')).filter(
      (anchor) => anchor.textContent?.trim() === 'Review',
    );
    expect(reviewAnchors).toHaveLength(0);

    const reviewSpans = Array.from(doc.querySelectorAll('span')).filter(
      (span) => span.textContent?.trim() === 'Review',
    );
    expect(reviewSpans).toHaveLength(2);

    expect(doc.querySelectorAll('a a')).toHaveLength(0);

    const cardLinks = Array.from(doc.querySelectorAll('a')).filter((anchor) =>
      (anchor.getAttribute('class') ?? '').includes('rounded-2xl'),
    );
    expect(cardLinks).toHaveLength(2);
    for (const link of cardLinks) {
      const className = link.getAttribute('class') ?? '';
      expect(className).toContain('transition-colors');
      expect(className).toContain('hover:bg-muted/50');
      expect(className).not.toContain('hover:bg-accent/40');
      expect(className).toContain('focus-visible:ring-[3px]');
    }
  });

  it('includes mode=review in incorrect question links', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: 'q_incorrect',
            slug: 'q-incorrect',
            stemMd: 'Stem for incorrect',
            difficulty: 'hard',
            lastAnsweredAt: '2026-02-02T00:00:00.000Z',
          }),
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const historyHref = buildHistoryQuestionsHref({
      limit: result.data.limit,
      offset: result.data.offset,
    });

    const incorrectHref = toQuestionRoute('q-incorrect', {
      from: 'history',
      mode: 'review',
      historyHref,
    });

    const hrefs = Array.from(doc.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.filter((href) => href === incorrectHref)).toHaveLength(1);
    expect(html).toContain('Review');
    expect(
      Array.from(doc.querySelectorAll('a')).some(
        (a) => a.textContent?.trim() === 'Review',
      ),
    ).toBe(false);
    expect(
      Array.from(doc.querySelectorAll('span')).some(
        (s) => s.textContent?.trim() === 'Review',
      ),
    ).toBe(true);
    expect(html).not.toContain('Reattempt');
  });

  it('builds standalone review links without historySeq/historyIndex params', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: 'q_1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: 'q_2',
            slug: 'q-2',
            stemMd: 'Stem for q2',
            lastAnsweredAt: '2026-02-02T00:00:00.000Z',
          }),
        ],
        totalCount: 2,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const questionLinks = Array.from(doc.querySelectorAll('a'))
      .map((anchor) => anchor.getAttribute('href'))
      .filter((href): href is string =>
        Boolean(href?.startsWith('/app/questions/')),
      );

    expect(questionLinks.length).toBeGreaterThan(0);
    expect(questionLinks.every((href) => !href.includes('historySeq='))).toBe(
      true,
    );
    expect(questionLinks.every((href) => !href.includes('historyIndex='))).toBe(
      true,
    );
  });

  it('does not render a Source filter control', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [createAvailableAttemptedQuestionRow()],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(html).not.toContain('Source');
    expect(doc.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(
      4,
    );
  });

  it('caps long question stems in the body preview', () => {
    const longStem = 'A'.repeat(300);
    const expectedBodyPreview = `${'A'.repeat(237)}...`;

    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            stemMd: longStem,
          }),
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const preview = doc.querySelector(
      '[data-testid="history-question-preview"]',
    );

    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain(expectedBodyPreview);
    expect(html).not.toContain(longStem);
  });

  it('renders design-system filter controls with grouped tags and sort', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            tagSlugs: ['opioids'],
          }),
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(
      <HistoryQuestionsTab
        result={result}
        tagOptions={[
          { slug: 'opioids', name: 'Opioids', kind: 'substance' },
          { slug: 'other', name: 'Other', kind: 'substance' },
          { slug: 'other-treatment', name: 'Other', kind: 'treatment' },
          { slug: 'screening', name: 'Screening', kind: 'topic' },
        ]}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelectorAll('form select')).toHaveLength(0);
    expect(doc.querySelector('select[name="result"]')).toBeNull();
    expect(doc.querySelector('select[name="difficulty"]')).toBeNull();
    expect(doc.querySelector('select[name="tag"]')).toBeNull();
    expect(doc.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(
      4,
    );
    expect(html).toContain('Result');
    expect(html).toContain('Difficulty');
    expect(html).toContain('Tag');
    expect(html).toContain('Sort');
  });

  it('does not render a client-side filtering "(X visible after filters)" hint', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: 'q_easy',
            isCorrect: true,
            slug: 'q-easy',
            stemMd: 'Stem for easy',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: 'q_hard',
            slug: 'q-hard',
            stemMd: 'Stem for hard',
            difficulty: 'hard',
            lastAnsweredAt: '2026-02-02T00:00:00.000Z',
          }),
        ],
        totalCount: 2,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(
      <HistoryQuestionsTab result={result} filters={{ difficulty: 'hard' }} />,
    );

    expect(html).not.toContain('visible after filters');
  });

  it('does not render the client-side mismatch empty-state card for difficulty/tag filters', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: 'q_easy_1',
            isCorrect: true,
            slug: 'q-easy-1',
            stemMd: 'Stem for easy 1',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: 'q_easy_2',
            slug: 'q-easy-2',
            stemMd: 'Stem for easy 2',
            lastAnsweredAt: '2026-02-02T00:00:00.000Z',
          }),
        ],
        totalCount: 2,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(
      <HistoryQuestionsTab result={result} filters={{ difficulty: 'hard' }} />,
    );

    expect(html).not.toContain(
      'No questions on this page match the selected difficulty/tag filters.',
    );
  });

  it('renders empty state when there are no attempted questions', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [],
        totalCount: 0,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);

    expect(html).toContain('No Quick Practice questions yet.');
  });

  it('renders pagination links when there are more rows than the page limit', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: 'q_1',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: 'q_2',
            slug: 'q-2',
            stemMd: 'Stem for q2',
          }),
        ],
        totalCount: 10,
        limit: 2,
        offset: 2,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);

    expect(html).toContain('Previous');
    expect(html).toContain(
      '/app/history?tab=questions&amp;offset=0&amp;limit=2',
    );
    expect(html).toContain('Next');
    expect(html).toContain(
      '/app/history?tab=questions&amp;offset=4&amp;limit=2',
    );
  });

  it('renders unavailable question placeholders with no question links', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          {
            isAvailable: false,
            questionId: 'q_1',
            isCorrect: true,
            sessionId: 'session-1',
            sessionMode: 'exam',
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Unavailable');
    expect(html).toContain('Correct');
    expect(html).not.toContain('/app/questions/');
  });

  it('renders correct and incorrect result badges', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: 'q_correct',
            isCorrect: true,
            slug: 'q-correct',
            stemMd: 'Stem for correct',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: 'q_incorrect',
            slug: 'q-incorrect',
            stemMd: 'Stem for incorrect',
          }),
        ],
        totalCount: 2,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const spans = Array.from(doc.querySelectorAll('span'));

    expect(spans.some((span) => span.textContent === 'Correct')).toBe(true);
    expect(spans.some((span) => span.textContent === 'Incorrect')).toBe(true);
  });
});
