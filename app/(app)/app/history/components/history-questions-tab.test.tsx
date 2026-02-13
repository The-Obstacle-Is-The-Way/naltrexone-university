// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetAttemptedQuestionsOutput } from '@/src/adapters/controllers/review-controller';
import { HistoryQuestionsTab } from './history-questions-tab';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('HistoryQuestionsTab', () => {
  it('renders attempted question cards with expected metadata and action links', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          {
            isAvailable: true,
            questionId: 'q_correct',
            isCorrect: true,
            sessionId: 'session-1',
            sessionMode: 'exam',
            slug: 'q-correct',
            stemMd: 'Stem for correct',
            difficulty: 'easy',
            tagSlugs: ['opioids'],
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
          {
            isAvailable: true,
            questionId: 'q_incorrect',
            isCorrect: false,
            sessionId: null,
            sessionMode: null,
            slug: 'q-incorrect',
            stemMd: 'Stem for incorrect',
            difficulty: 'hard',
            tagSlugs: [],
            lastAnsweredAt: '2026-02-02T00:00:00.000Z',
          },
        ],
        totalCount: 2,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);
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

    const correctHref = toQuestionRoute('q-correct', {
      from: 'history',
      mode: 'review',
    });
    const incorrectHref = toQuestionRoute('q-incorrect', {
      from: 'history',
      mode: 'review',
    });

    expect(doc.querySelectorAll(`a[href="${correctHref}"]`)).toHaveLength(2);
    expect(doc.querySelectorAll(`a[href="${incorrectHref}"]`)).toHaveLength(2);
  });

  it('includes mode=review in incorrect question links', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          {
            isAvailable: true,
            questionId: 'q_incorrect',
            isCorrect: false,
            sessionId: null,
            sessionMode: null,
            slug: 'q-incorrect',
            stemMd: 'Stem for incorrect',
            difficulty: 'hard',
            tagSlugs: [],
            lastAnsweredAt: '2026-02-02T00:00:00.000Z',
          },
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const incorrectHref = toQuestionRoute('q-incorrect', {
      from: 'history',
      mode: 'review',
    });

    expect(doc.querySelectorAll(`a[href="${incorrectHref}"]`)).toHaveLength(2);
    expect(html).toContain('Review');
    expect(html).not.toContain('Reattempt');
  });

  it('caps long question stems in the body preview', () => {
    const longStem = 'A'.repeat(300);
    const expectedBodyPreview = `${'A'.repeat(237)}...`;

    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
        rows: [
          {
            isAvailable: true,
            questionId: 'q_1',
            isCorrect: false,
            sessionId: null,
            sessionMode: null,
            slug: 'q-1',
            stemMd: longStem,
            difficulty: 'easy',
            tagSlugs: [],
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        totalCount: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistoryQuestionsTab result={result} />);

    expect(html).toContain(expectedBodyPreview);
    expect(html).not.toContain(longStem);
  });

  it('renders result and source filter dropdowns', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
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
            tagSlugs: ['opioids'],
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

    const resultSelect = doc.querySelector('select[name="result"]');
    expect(resultSelect).not.toBeNull();

    const sourceSelect = doc.querySelector('select[name="source"]');
    expect(sourceSelect).not.toBeNull();

    const resultOptions = Array.from(
      resultSelect?.querySelectorAll('option') ?? [],
    );
    expect(resultOptions.some((o) => o.getAttribute('value') === '')).toBe(
      true,
    );
    expect(
      resultOptions.some(
        (o) =>
          o.getAttribute('value') === 'correct' && o.textContent === 'Correct',
      ),
    ).toBe(true);
    expect(
      resultOptions.some(
        (o) =>
          o.getAttribute('value') === 'incorrect' &&
          o.textContent === 'Incorrect',
      ),
    ).toBe(true);

    const sourceOptions = Array.from(
      sourceSelect?.querySelectorAll('option') ?? [],
    );
    expect(sourceOptions.some((o) => o.getAttribute('value') === '')).toBe(
      true,
    );
    expect(
      sourceOptions.some(
        (o) => o.getAttribute('value') === 'tutor' && o.textContent === 'Tutor',
      ),
    ).toBe(true);
    expect(
      sourceOptions.some(
        (o) => o.getAttribute('value') === 'exam' && o.textContent === 'Exam',
      ),
    ).toBe(true);
    expect(
      sourceOptions.some(
        (o) =>
          o.getAttribute('value') === 'adhoc' &&
          o.textContent === 'Ad-hoc practice',
      ),
    ).toBe(true);

    expect(doc.querySelector('select[name="difficulty"]')).not.toBeNull();
    expect(doc.querySelector('select[name="tag"]')).not.toBeNull();
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

  it('renders pagination links when there are more rows than the page limit', () => {
    const result: ActionResult<GetAttemptedQuestionsOutput> = {
      ok: true,
      data: {
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
          {
            isAvailable: true,
            questionId: 'q_2',
            isCorrect: false,
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
          {
            isAvailable: true,
            questionId: 'q_correct',
            isCorrect: true,
            sessionId: null,
            sessionMode: null,
            slug: 'q-correct',
            stemMd: 'Stem for correct',
            difficulty: 'easy',
            tagSlugs: [],
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
          {
            isAvailable: true,
            questionId: 'q_incorrect',
            isCorrect: false,
            sessionId: null,
            sessionMode: null,
            slug: 'q-incorrect',
            stemMd: 'Stem for incorrect',
            difficulty: 'easy',
            tagSlugs: [],
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
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
