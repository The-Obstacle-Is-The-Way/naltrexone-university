// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { ok } from '@/src/adapters/controllers/action-result';
import type { GetSessionHistoryOutput } from '@/src/adapters/controllers/practice-controller';
import type { GetAttemptedQuestionsOutput } from '@/src/adapters/controllers/review-controller';
import type { GetTagsOutput } from '@/src/adapters/controllers/tag-controller';
import {
  createAvailableAttemptedQuestionRow,
  createSessionHistoryRow,
} from '@/src/application/test-helpers/view-rows';
import {
  findElementByText,
  isNodeBefore,
  parseHtml,
} from '@/tests/shared/dom-helpers';
import { createHistoryPage } from './page';

const {
  fixtureQuestion1Id,
  fixtureQuestionCorrectRecentId,
  fixtureQuestionEasyId,
  fixtureQuestionHardId,
  fixtureQuestionIncorrectOldId,
  fixtureQuestionIncorrectRecentId,
  fixtureQuestionMediumId,
  fixtureQuestionVisibleId,
  fixtureSession1Id,
  fixtureTag1Id,
  fixtureTagDiagnosisId,
  fixtureTagSubstanceId,
  fixtureTagTopicId,
  fixtureTagTreatmentId,
} = vi.hoisted(() => ({
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestionCorrectRecentId: crypto.randomUUID(),
  fixtureQuestionEasyId: crypto.randomUUID(),
  fixtureQuestionHardId: crypto.randomUUID(),
  fixtureQuestionIncorrectOldId: crypto.randomUUID(),
  fixtureQuestionIncorrectRecentId: crypto.randomUUID(),
  fixtureQuestionMediumId: crypto.randomUUID(),
  fixtureQuestionVisibleId: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
  fixtureTag1Id: crypto.randomUUID(),
  fixtureTagDiagnosisId: crypto.randomUUID(),
  fixtureTagSubstanceId: crypto.randomUUID(),
  fixtureTagTopicId: crypto.randomUUID(),
  fixtureTagTreatmentId: crypto.randomUUID(),
}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function getTabLinkAriaCurrent(html: string, label: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const links = Array.from(doc.querySelectorAll('a'));
  const link = links.find((l) => l.textContent === label);
  return link?.getAttribute('aria-current') ?? null;
}

describe('app/(app)/app/history/page', () => {
  it('renders Sessions tab as active by default', async () => {
    const output: GetSessionHistoryOutput = {
      rows: [],
      total: 0,
      limit: 20,
      offset: 0,
    };

    const getSessionHistoryFn = vi.fn(async (_input: unknown) => ok(output));

    const HistoryPage = createHistoryPage({ getSessionHistoryFn });

    const element = await HistoryPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('History');
    expect(getTabLinkAriaCurrent(html, 'Sessions')).toBe('page');
    expect(getTabLinkAriaCurrent(html, 'Questions')).toBeNull();
    expect(getSessionHistoryFn).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });

  it('passes sessions mode filter to session history fetch when mode is provided', async () => {
    const output: GetSessionHistoryOutput = {
      rows: [],
      total: 0,
      limit: 20,
      offset: 0,
    };
    const getSessionHistoryFn = vi.fn(async (_input: unknown) => ok(output));

    const HistoryPage = createHistoryPage({ getSessionHistoryFn });

    await HistoryPage({
      searchParams: Promise.resolve({
        tab: 'sessions',
        mode: 'exam',
      }),
    });

    expect(getSessionHistoryFn).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      mode: 'exam',
    });
  });

  it('renders Questions tab as active when tab=questions', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [],
      totalCount: 0,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) => ok({ rows: [] }));

    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'questions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      'Review completed sessions and your attempted questions.',
    );
    expect(getTabLinkAriaCurrent(html, 'Questions')).toBe('page');
    expect(getTabLinkAriaCurrent(html, 'Sessions')).toBeNull();
    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        source: undefined,
      }),
    );
    expect(getTagsFn).toHaveBeenCalledWith({});
  });

  it('passes source filter to attempted questions fetch when source is provided', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [],
      totalCount: 0,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) => ok({ rows: [] }));

    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    await HistoryPage({
      searchParams: Promise.resolve({
        tab: 'questions',
        source: 'tutor',
      }),
    });

    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'tutor',
      }),
    );
  });

  it('passes undefined source to attempted questions fetch when source is missing', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [],
      totalCount: 0,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) => ok({ rows: [] }));

    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    await HistoryPage({
      searchParams: Promise.resolve({
        tab: 'questions',
      }),
    });

    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        source: undefined,
      }),
    );
  });

  it('passes session history data to the client component when tab=sessions', async () => {
    const output: GetSessionHistoryOutput = {
      rows: [createSessionHistoryRow({ sessionId: fixtureSession1Id })],
      total: 1,
      limit: 20,
      offset: 0,
    };

    const getSessionHistoryFn = vi.fn(async (_input: unknown) => ok(output));

    const HistoryPage = createHistoryPage({ getSessionHistoryFn });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'sessions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Exam');
    expect(html).toContain('View breakdown');
  });

  it('passes attempted questions data to the client component when tab=questions', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [
        createAvailableAttemptedQuestionRow({ questionId: fixtureQuestion1Id }),
      ],
      totalCount: 1,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) =>
      ok({
        rows: [
          {
            id: fixtureTag1Id,
            slug: 'opioids',
            name: 'Opioids',
            kind: 'topic',
          },
        ],
      } satisfies GetTagsOutput),
    );

    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'questions' }),
    });
    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const questionLink = Array.from(doc.querySelectorAll('a')).find((anchor) =>
      anchor.getAttribute('href')?.startsWith('/app/questions/q-1?'),
    );

    expect(html).toContain('Stem for q1');
    expect(questionLink?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', {
        from: 'history',
        mode: 'review',
        historyHref: '/app/history?tab=questions&offset=0&limit=20',
      }),
    );
    expect(html).not.toContain('Reattempt');
  });

  it('excludes diagnosis kind from tag options', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [
        createAvailableAttemptedQuestionRow({
          questionId: fixtureQuestionVisibleId,
          isCorrect: true,
          slug: 'q-visible',
          stemMd: 'Visible question',
        }),
      ],
      totalCount: 1,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) =>
      ok({
        rows: [
          {
            id: fixtureTagTopicId,
            slug: 'screening-diagnosis',
            name: 'Screening & Diagnosis',
            kind: 'topic',
          },
          {
            id: fixtureTagSubstanceId,
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
          {
            id: fixtureTagTreatmentId,
            slug: 'naltrexone',
            name: 'Naltrexone',
            kind: 'treatment',
          },
          {
            id: fixtureTagDiagnosisId,
            slug: 'opioid-use-disorder',
            name: 'Opioid Use Disorder',
            kind: 'diagnosis',
          },
        ],
      } satisfies GetTagsOutput),
    );

    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'questions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('History');
    expect(html).not.toContain('Opioid Use Disorder');
  });

  it('passes difficulty and tag filters to attempted questions fetch', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [],
      totalCount: 0,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) => ok({ rows: [] }));

    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    await HistoryPage({
      searchParams: Promise.resolve({
        tab: 'questions',
        difficulty: 'hard',
        tag: 'opioids',
      }),
    });

    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        difficulty: 'hard',
        tagSlug: 'opioids',
        source: undefined,
      }),
    );
  });

  it('passes incorrect-first sort to attempted questions fetch and renders backend order', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [
        createAvailableAttemptedQuestionRow({
          questionId: fixtureQuestionCorrectRecentId,
          isCorrect: true,
          slug: 'q-correct-recent',
          stemMd: 'Correct recent',
          lastAnsweredAt: '2026-02-03T00:00:00.000Z',
        }),
        createAvailableAttemptedQuestionRow({
          questionId: fixtureQuestionIncorrectOldId,
          slug: 'q-incorrect-old',
          stemMd: 'Incorrect old',
        }),
        createAvailableAttemptedQuestionRow({
          questionId: fixtureQuestionIncorrectRecentId,
          slug: 'q-incorrect-recent',
          stemMd: 'Incorrect recent',
          lastAnsweredAt: '2026-02-02T00:00:00.000Z',
        }),
      ],
      totalCount: 3,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) => ok({ rows: [] }));
    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    const element = await HistoryPage({
      searchParams: Promise.resolve({
        tab: 'questions',
        sort: 'incorrect-first',
      }),
    });
    const html = renderToStaticMarkup(element);
    const doc = parseHtml(html);
    const correctRecent = findElementByText(doc, '*', 'Correct recent');
    const incorrectOld = findElementByText(doc, '*', 'Incorrect old');
    const incorrectRecent = findElementByText(doc, '*', 'Incorrect recent');

    expect(incorrectRecent).not.toBeNull();
    expect(incorrectOld).not.toBeNull();
    expect(correctRecent).not.toBeNull();
    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'incorrect-first',
        source: undefined,
      }),
    );
    expect(
      correctRecent && incorrectOld
        ? isNodeBefore(correctRecent, incorrectOld)
        : false,
    ).toBe(true);
    expect(
      incorrectOld && incorrectRecent
        ? isNodeBefore(incorrectOld, incorrectRecent)
        : false,
    ).toBe(true);
  });

  it('passes difficulty sort to attempted questions fetch and renders backend order', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [
        createAvailableAttemptedQuestionRow({
          questionId: fixtureQuestionEasyId,
          isCorrect: true,
          slug: 'q-easy',
          stemMd: 'Easy question',
          lastAnsweredAt: '2026-02-03T00:00:00.000Z',
        }),
        createAvailableAttemptedQuestionRow({
          questionId: fixtureQuestionHardId,
          slug: 'q-hard',
          stemMd: 'Hard question',
          difficulty: 'hard',
        }),
        createAvailableAttemptedQuestionRow({
          questionId: fixtureQuestionMediumId,
          slug: 'q-medium',
          stemMd: 'Medium question',
          difficulty: 'medium',
          lastAnsweredAt: '2026-02-02T00:00:00.000Z',
        }),
      ],
      totalCount: 3,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );
    const getTagsFn = vi.fn(async (_input: unknown) => ok({ rows: [] }));
    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    const element = await HistoryPage({
      searchParams: Promise.resolve({
        tab: 'questions',
        sort: 'difficulty',
      }),
    });
    const html = renderToStaticMarkup(element);
    const doc = parseHtml(html);
    const easy = findElementByText(doc, '*', 'Easy question');
    const hard = findElementByText(doc, '*', 'Hard question');
    const medium = findElementByText(doc, '*', 'Medium question');

    expect(hard).not.toBeNull();
    expect(medium).not.toBeNull();
    expect(easy).not.toBeNull();
    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'difficulty',
        source: undefined,
      }),
    );
    expect(easy && hard ? isNodeBefore(easy, hard) : false).toBe(true);
    expect(hard && medium ? isNodeBefore(hard, medium) : false).toBe(true);
  });

  it('renders an error state when session history fetch returns not-ok', async () => {
    const getSessionHistoryFn = vi.fn(
      async (
        _input: unknown,
      ): Promise<ActionResult<GetSessionHistoryOutput>> => ({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Session history failed' },
      }),
    );

    const HistoryPage = createHistoryPage({ getSessionHistoryFn });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'sessions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-error-card="true"');
    expect(html).toContain('Session history failed');
  });

  it('renders an error state when attempted questions fetch returns not-ok', async () => {
    const getAttemptedQuestionsFn = vi.fn(
      async (
        _input: unknown,
      ): Promise<ActionResult<GetAttemptedQuestionsOutput>> => ({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Attempted questions failed',
        },
      }),
    );
    const getTagsFn = vi.fn(async (_input: unknown) => ok({ rows: [] }));

    const HistoryPage = createHistoryPage({
      getAttemptedQuestionsFn,
      getTagsFn,
    });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'questions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-error-card="true"');
    expect(html).toContain('Attempted questions failed');
  });
});
