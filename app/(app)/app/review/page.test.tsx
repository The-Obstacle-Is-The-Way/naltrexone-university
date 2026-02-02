// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ReviewView, renderReview } from './page';

describe('app/(app)/app/review', () => {
  it('renders missed questions', () => {
    const html = renderToStaticMarkup(
      <ReviewView
        rows={[
          {
            questionId: 'q_1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            lastAnsweredAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        limit={20}
        offset={0}
      />,
    );

    expect(html).toContain('Review');
    expect(html).toContain('q-1');
    expect(html).toContain('Stem for q1');
    expect(html).toContain('easy');
    expect(html).toContain('Missed 2026-02-01');
    expect(html).toContain('Reattempt');
    expect(html).toContain('/app/questions/q-1');
  });

  it('renders empty state when no missed questions exist', () => {
    const html = renderToStaticMarkup(
      <ReviewView rows={[]} limit={20} offset={0} />,
    );

    expect(html).toContain('Review');
    expect(html).toContain('No missed questions yet.');
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
});
