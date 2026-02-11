// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetMissedQuestionsOutput } from '@/src/adapters/controllers/review-controller';
import { HistoryMissedTab } from './history-missed-tab';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('HistoryMissedTab', () => {
  it('renders missed question cards with expected metadata and Reattempt links', () => {
    const result: ActionResult<GetMissedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          {
            isAvailable: true,
            questionId: 'q_1',
            sessionId: 'session-1',
            sessionMode: 'exam',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            tagSlugs: ['opioids'],
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryMissedTab result={result} />);

    expect(html).toContain('Stem for q1');
    expect(html).toContain('easy');
    expect(html).toContain('Missed Feb 1, 2026');
    expect(html).toContain('Exam session');
    expect(html).toContain('Reattempt');
    expect(html).toContain(toQuestionRoute('q-1', { from: 'history' }));
  });

  it('renders difficulty and tag filter dropdowns', () => {
    const result: ActionResult<GetMissedQuestionsOutput> = {
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
            tagSlugs: ['opioids'],
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryMissedTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('select[name="difficulty"]')).not.toBeNull();
    const tagSelect = doc.querySelector('select[name="tag"]');
    expect(tagSelect).not.toBeNull();

    const tagOptions = Array.from(tagSelect?.querySelectorAll('option') ?? []);
    expect(tagOptions.some((o) => o.getAttribute('value') === 'opioids')).toBe(
      true,
    );
  });

  it('renders empty state when there are no missed questions', () => {
    const result: ActionResult<GetMissedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [],
        totalCount: 0,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryMissedTab result={result} />);

    expect(html).toContain('No missed questions yet.');
  });

  it('renders pagination links when there are more rows than the page limit', () => {
    const result: ActionResult<GetMissedQuestionsOutput> = {
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
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
          {
            isAvailable: true,
            questionId: 'q_2',
            sessionId: null,
            sessionMode: null,
            slug: 'q-2',
            stemMd: 'Stem for q2',
            difficulty: 'easy',
            tagSlugs: [],
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        totalCount: 10,
        limit: 2,
        offset: 2,
      },
    };

    const html = renderToStaticMarkup(<HistoryMissedTab result={result} />);

    expect(html).toContain('Previous');
    expect(html).toContain('/app/history?tab=missed&amp;offset=0&amp;limit=2');
    expect(html).toContain('Next');
    expect(html).toContain('/app/history?tab=missed&amp;offset=4&amp;limit=2');
  });

  it('renders unavailable question placeholders with no question links', () => {
    const result: ActionResult<GetMissedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          {
            isAvailable: false,
            questionId: 'q_1',
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

    const html = renderToStaticMarkup(<HistoryMissedTab result={result} />);

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Unavailable');
    expect(html).not.toContain('/app/questions/');
  });
});
