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

const {
  fixtureQuestion1Id,
  fixtureQuestion2Id,
  fixtureQuestionCorrectId,
  fixtureQuestionEasy1Id,
  fixtureQuestionEasy2Id,
  fixtureQuestionEasyId,
  fixtureQuestionExamId,
  fixtureQuestionHardId,
  fixtureQuestionIncorrectId,
  fixtureQuestionTutorId,
  fixtureSession1Id,
  fixtureSessionExamId,
  fixtureSessionTutorId,
} = vi.hoisted(() => ({
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureQuestionCorrectId: crypto.randomUUID(),
  fixtureQuestionEasy1Id: crypto.randomUUID(),
  fixtureQuestionEasy2Id: crypto.randomUUID(),
  fixtureQuestionEasyId: crypto.randomUUID(),
  fixtureQuestionExamId: crypto.randomUUID(),
  fixtureQuestionHardId: crypto.randomUUID(),
  fixtureQuestionIncorrectId: crypto.randomUUID(),
  fixtureQuestionTutorId: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
  fixtureSessionExamId: crypto.randomUUID(),
  fixtureSessionTutorId: crypto.randomUUID(),
}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let HistoryQuestionsTab: typeof import('./history-questions-tab').HistoryQuestionsTab;
let HISTORY_QUESTION_SOURCE_FILTER_OPTIONS: typeof import('./history-questions-tab').HISTORY_QUESTION_SOURCE_FILTER_OPTIONS;

beforeAll(async () => {
  const module = await import('./history-questions-tab');
  HistoryQuestionsTab = module.HistoryQuestionsTab;
  HISTORY_QUESTION_SOURCE_FILTER_OPTIONS =
    module.HISTORY_QUESTION_SOURCE_FILTER_OPTIONS;
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
    questionId: fixtureQuestion1Id,
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
            questionId: fixtureQuestionCorrectId,
            isCorrect: true,
            sessionId: fixtureSession1Id,
            sessionMode: 'exam',
            slug: 'q-correct',
            stemMd: 'Stem for correct',
            tagSlugs: ['opioids'],
          }),
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionIncorrectId,
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
    expect(reviewSpans).toHaveLength(0);

    expect(doc.querySelectorAll('a a')).toHaveLength(0);

    const cardLinks = Array.from(doc.querySelectorAll('a')).filter((anchor) =>
      (anchor.getAttribute('class') ?? '').includes('rounded-2xl'),
    );
    expect(cardLinks).toHaveLength(2);
    for (const link of cardLinks) {
      const classTokens = (link.getAttribute('class') ?? '').split(/\s+/);
      const contentStack = link.firstElementChild;
      const contentStackTokens = (
        contentStack?.getAttribute('class') ?? ''
      ).split(/\s+/);

      expect(classTokens).toContain('bg-foreground/[0.08]');
      expect(classTokens).not.toContain('bg-foreground/5');
      expect(classTokens).toContain('transition-colors');
      expect(classTokens).toContain('hover:bg-foreground/[0.12]');
      expect(classTokens).not.toContain('hover:bg-foreground/[0.08]');
      expect(classTokens).toContain('ring-focus');
      expect(classTokens).not.toContain('border');
      expect(classTokens).not.toContain('border-border');
      expect(classTokens).not.toContain('shadow-sm');
      expect(classTokens).not.toContain('hover:bg-muted/50');
      expect(classTokens).not.toContain('hover:bg-accent/40');
      expect(contentStack?.tagName).toBe('DIV');
      expect(contentStackTokens).toContain('space-y-2');
      expect(contentStackTokens).not.toContain('sm:flex-row');
      expect(contentStackTokens).not.toContain('sm:justify-between');
    }
  });

  it('includes mode=review in incorrect question links', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionIncorrectId,
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
    expect(
      Array.from(doc.querySelectorAll('a')).some(
        (a) => a.textContent?.trim() === 'Review',
      ),
    ).toBe(false);
    expect(
      Array.from(doc.querySelectorAll('span')).some(
        (s) => s.textContent?.trim() === 'Review',
      ),
    ).toBe(false);
  });

  it('renders tutor and exam provenance labels for session-backed question rows', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionTutorId,
            sessionId: fixtureSessionTutorId,
            sessionMode: 'tutor',
            slug: 'q-tutor',
            stemMd: 'Stem for tutor session',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionExamId,
            sessionId: fixtureSessionExamId,
            sessionMode: 'exam',
            slug: 'q-exam',
            stemMd: 'Stem for exam session',
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
    const rows = Array.from(doc.querySelectorAll('li'));
    const tutorRow = rows.find((row) =>
      row.textContent?.includes('Stem for tutor session'),
    );
    const examRow = rows.find((row) =>
      row.textContent?.includes('Stem for exam session'),
    );

    expect(tutorRow?.textContent).toContain('Tutor session');
    expect(examRow?.textContent).toContain('Exam session');
  });

  it('builds standalone review links without historySeq/historyIndex params', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestion1Id,
            slug: 'q-1',
            stemMd: 'Stem for q1',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestion2Id,
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

  it('renders a Source filter control with expected options', () => {
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

    expect(html).toContain('Source');
    expect(
      HISTORY_QUESTION_SOURCE_FILTER_OPTIONS.map((option) => option.label),
    ).toEqual([
      'All sources',
      'Ad-hoc practice',
      'Tutor session',
      'Exam session',
    ]);
    expect(doc.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(
      5,
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
      5,
    );
    expect(html).toContain('Result');
    expect(html).toContain('Difficulty');
    expect(html).toContain('Tag');
    expect(html).toContain('Source');
    expect(html).toContain('Sort');
  });

  it('renders a Clear filters link that drops source from the href', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [createAvailableAttemptedQuestionRow()],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(
      <HistoryQuestionsTab
        result={result}
        filters={{ result: 'incorrect', source: 'exam' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clearFiltersLink = Array.from(doc.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.trim() === 'Clear filters',
    );

    expect(clearFiltersLink?.getAttribute('href')).toBe(
      buildHistoryQuestionsHref({ limit: 20, offset: 0 }),
    );
    expect(clearFiltersLink?.getAttribute('href')).not.toContain('source=');
  });

  it('does not render a client-side filtering "(X visible after filters)" hint', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionEasyId,
            isCorrect: true,
            slug: 'q-easy',
            stemMd: 'Stem for easy',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionHardId,
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
            questionId: fixtureQuestionEasy1Id,
            isCorrect: true,
            slug: 'q-easy-1',
            stemMd: 'Stem for easy 1',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionEasy2Id,
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

    expect(html).toContain('No questions attempted yet.');
  });

  it('treats a source-only filter as active when no questions match', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [],
        totalCount: 0,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(
      <HistoryQuestionsTab result={result} filters={{ source: 'exam' }} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clearFiltersLink = Array.from(doc.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.trim() === 'Clear filters',
    );

    expect(html).toContain('No questions match these filters.');
    expect(html).not.toContain('No questions attempted yet.');
    expect(html).not.toContain('Go to Practice');
    expect(clearFiltersLink?.getAttribute('href')).toBe(
      buildHistoryQuestionsHref({ limit: 20, offset: 0 }),
    );
  });

  it('renders pagination links when there are more rows than the page limit', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestion1Id,
          }),
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestion2Id,
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

  it('preserves source filters in the back-to-first-page link when a page is empty', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [],
        totalCount: 21,
        limit: 20,
        offset: 20,
      },
    };

    const html = renderToStaticMarkup(
      <HistoryQuestionsTab
        result={result}
        filters={{ result: 'incorrect', source: 'exam' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backToFirstPageLink = Array.from(doc.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.trim() === 'Back to first page',
    );

    expect(html).toContain('No more questions on this page.');
    expect(backToFirstPageLink?.getAttribute('href')).toBe(
      buildHistoryQuestionsHref({
        limit: 20,
        offset: 0,
        filters: {
          result: 'incorrect',
          source: 'exam',
        },
      }),
    );
  });

  it('renders unavailable question placeholders with no question links', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          {
            isAvailable: false,
            questionId: fixtureQuestion1Id,
            isCorrect: true,
            sessionId: fixtureSession1Id,
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
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Unavailable');
    expect(html).toContain('Correct');
    expect(html).not.toContain('/app/questions/');

    const rowContainer = doc.querySelector('li > *');
    expect(rowContainer?.tagName).toBe('DIV');

    const classTokens = (rowContainer?.getAttribute('class') ?? '').split(
      /\s+/,
    );
    expect(classTokens).toContain('rounded-2xl');
    expect(classTokens).toContain('bg-foreground/[0.08]');
    expect(classTokens).not.toContain('bg-foreground/5');
    expect(classTokens).toContain('p-4');
    expect(classTokens).not.toContain('border-border');
    expect(classTokens).not.toContain('shadow-sm');

    const contentStack = rowContainer?.firstElementChild;
    const contentStackTokens = (
      contentStack?.getAttribute('class') ?? ''
    ).split(/\s+/);
    expect(contentStackTokens).toContain('space-y-2');
    expect(contentStackTokens).not.toContain('sm:flex-row');
    expect(contentStackTokens).not.toContain('sm:justify-between');
  });

  it('renders correct and incorrect result badges', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionCorrectId,
            isCorrect: true,
            slug: 'q-correct',
            stemMd: 'Stem for correct',
          }),
          createAvailableAttemptedQuestionRow({
            questionId: fixtureQuestionIncorrectId,
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
