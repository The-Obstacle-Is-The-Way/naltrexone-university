// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createReviewPage,
  ReviewView,
  renderReview,
} from '@/app/(app)/app/review/page';
import { ok } from '@/src/adapters/controllers/action-result';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';

describe('app/(app)/app/review', () => {
  it('renders a truncated stem preview as the card title instead of raw slug text', () => {
    const longStem =
      'A very long stem that should be truncated in the card title for readability in review lists.';
    const expectedPreview = getStemPreview(longStem, 80);
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
            sessionId: null,
            sessionMode: null,
            slug: 'q-1',
            stemMd: longStem,
            difficulty: 'easy',
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={20}
        offset={0}
        totalCount={1}
      />,
    );

    expect(html).toContain(expectedPreview);
    expect(html).toContain(longStem);
    expect(html).not.toContain('>q-1<');
  });

  it('renders stem description as plain text (no raw markdown syntax)', () => {
    const stemMd = '# Heading with [link](https://example.com) and **bold**';
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
            sessionId: null,
            sessionMode: null,
            slug: 'q-1',
            stemMd,
            difficulty: 'easy',
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={20}
        offset={0}
        totalCount={1}
      />,
    );

    expect(html).toContain('Heading with link and bold');
    expect(html).not.toContain('# Heading');
    expect(html).not.toContain('[link](https://example.com)');
    expect(html).not.toContain('**bold**');
  });

  it('hides body text when stem plain text is short enough to fit the title', () => {
    const stemMd = 'Short stem question about pharmacology';
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
            sessionId: null,
            sessionMode: null,
            slug: 'q-1',
            stemMd,
            difficulty: 'easy',
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={20}
        offset={0}
        totalCount={1}
      />,
    );

    const titleOccurrences = html.split(stemMd).length - 1;
    expect(titleOccurrences).toBe(1);
  });

  it('renders missed questions', () => {
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
            sessionId: null,
            sessionMode: null,
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={20}
        offset={0}
        totalCount={1}
      />,
    );

    expect(html).toContain('Review');
    expect(html).toContain('Showing 1–1 of 1');
    expect(html).toContain('Stem for q1');
    expect(html).toContain('easy');
    expect(html).toContain('Missed 2026-02-01');
    expect(html).toContain('Reattempt');
    expect(html).toContain('/app/questions/q-1');
    expect(html).toContain(
      'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
    );
  });

  it('renders pagination links when offset > 0 and rows length equals limit', () => {
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
            sessionId: null,
            sessionMode: null,
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
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
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={2}
        offset={2}
        totalCount={10}
      />,
    );

    expect(html).toContain('Previous');
    expect(html).toContain('/app/review?offset=0&amp;limit=2');
    expect(html).toContain('Next');
    expect(html).toContain('/app/review?offset=4&amp;limit=2');
  });

  it('renders empty state when no missed questions exist', () => {
    const html = renderToStaticMarkup(
      <ReviewView rows={[]} limit={20} offset={0} totalCount={0} />,
    );

    expect(html).toContain('Review');
    expect(html).toContain('No missed questions yet.');
  });

  it('renders unavailable missed questions without a reattempt link', () => {
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            isAvailable: false,
            questionId: 'q_orphaned',
            sessionId: null,
            sessionMode: null,
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={20}
        offset={0}
        totalCount={1}
      />,
    );

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Missed 2026-02-01');
    expect(html).not.toContain('Reattempt');
  });

  it('renders session-origin metadata for missed questions', () => {
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
            sessionId: 'session-1',
            sessionMode: 'exam',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={20}
        offset={0}
        totalCount={1}
      />,
    );

    expect(html).toContain('Exam session');
  });

  it('renders an error state when missed questions load fails', () => {
    const element = renderReview({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to load missed questions.');
    expect(html).toContain('Internal error');
    expect(html).toContain('Go to Practice');
  });

  it('renders ok state via renderReview', () => {
    const element = renderReview(
      ok({
        rows: [],
        limit: 20,
        offset: 0,
        totalCount: 0,
      }),
    );
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Review');
    expect(html).toContain('No missed questions yet.');
  });

  it('parses limit and offset from searchParams in createReviewPage', async () => {
    const getMissedQuestionsFn = vi.fn(async (input: unknown) => {
      const data = input as { limit: number; offset: number };
      return ok({
        rows: [],
        limit: data.limit,
        offset: data.offset,
        totalCount: 0,
      });
    });

    const ReviewPage = createReviewPage({ getMissedQuestionsFn });

    await ReviewPage({
      searchParams: Promise.resolve({ limit: 'NaN', offset: '0' }),
    });
    await ReviewPage({
      searchParams: Promise.resolve({ limit: '1.5', offset: '2.2' }),
    });
    await ReviewPage({
      searchParams: Promise.resolve({ limit: '0', offset: '-1' }),
    });
    await ReviewPage({
      searchParams: Promise.resolve({ limit: '101', offset: '5' }),
    });

    expect(getMissedQuestionsFn).toHaveBeenNthCalledWith(1, {
      limit: 20,
      offset: 0,
    });
    expect(getMissedQuestionsFn).toHaveBeenNthCalledWith(2, {
      limit: 20,
      offset: 0,
    });
    expect(getMissedQuestionsFn).toHaveBeenNthCalledWith(3, {
      limit: 1,
      offset: 0,
    });
    expect(getMissedQuestionsFn).toHaveBeenNthCalledWith(4, {
      limit: 100,
      offset: 5,
    });
  });
});
