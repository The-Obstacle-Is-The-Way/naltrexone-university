// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { ok } from '@/src/adapters/controllers/action-result';
import type { GetSessionHistoryOutput } from '@/src/adapters/controllers/practice-controller';
import type { GetAttemptedQuestionsOutput } from '@/src/adapters/controllers/review-controller';
import { createHistoryPage } from './page';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
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

    const HistoryPage = createHistoryPage({ getAttemptedQuestionsFn });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'questions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(getTabLinkAriaCurrent(html, 'Questions')).toBe('page');
    expect(getTabLinkAriaCurrent(html, 'Sessions')).toBeNull();
    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
      }),
    );
  });

  it('renders Questions tab as active when tab=missed (backward compat alias)', async () => {
    const output: GetAttemptedQuestionsOutput = {
      rows: [],
      totalCount: 0,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );

    const HistoryPage = createHistoryPage({ getAttemptedQuestionsFn });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'missed' }),
    });
    const html = renderToStaticMarkup(element);

    expect(getTabLinkAriaCurrent(html, 'Questions')).toBe('page');
    expect(getTabLinkAriaCurrent(html, 'Sessions')).toBeNull();
    expect(getAttemptedQuestionsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        result: 'incorrect',
      }),
    );
  });

  it('passes session history data to the client component when tab=sessions', async () => {
    const output: GetSessionHistoryOutput = {
      rows: [
        {
          sessionId: 'session-1',
          mode: 'exam',
          questionCount: 10,
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
          startedAt: '2026-02-07T00:00:00.000Z',
          endedAt: '2026-02-07T00:20:00.000Z',
        },
      ],
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
        {
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
        },
      ],
      totalCount: 1,
      limit: 20,
      offset: 0,
    };

    const getAttemptedQuestionsFn = vi.fn(async (_input: unknown) =>
      ok(output),
    );

    const HistoryPage = createHistoryPage({ getAttemptedQuestionsFn });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'questions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Stem for q1');
    expect(html).toContain('Reattempt');
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

    const HistoryPage = createHistoryPage({ getAttemptedQuestionsFn });

    const element = await HistoryPage({
      searchParams: Promise.resolve({ tab: 'questions' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-error-card="true"');
    expect(html).toContain('Attempted questions failed');
  });
});
