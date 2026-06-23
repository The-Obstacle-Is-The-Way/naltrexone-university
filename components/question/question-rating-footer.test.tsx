// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { containsDescendant } from '@/tests/shared/dom-helpers';

type QuestionRatingFooterModule = typeof import('./question-rating-footer');

let QuestionRatingFooter: QuestionRatingFooterModule['QuestionRatingFooter'];

beforeAll(async () => {
  ({ QuestionRatingFooter } = await import('./question-rating-footer'));
});

function renderFooter(
  overrides: Partial<Parameters<typeof QuestionRatingFooter>[0]> = {},
) {
  const html = renderToStaticMarkup(
    <QuestionRatingFooter
      rating={null}
      feedbackStatus="idle"
      onRate={() => undefined}
      {...overrides}
    />,
  );

  return {
    html,
    doc: new DOMParser().parseFromString(html, 'text/html'),
  };
}

describe('QuestionRatingFooter', () => {
  it('wraps the rating control in the post-action footer chrome', () => {
    const { doc, html } = renderFooter();
    const footer = doc.querySelector('[data-testid="question-rating-footer"]');
    const content = doc.querySelector(
      '[data-testid="question-rating-footer-content"]',
    );
    const legend = doc.querySelector('legend');

    expect(footer?.getAttribute('class')).toContain('border-t');
    expect(footer?.getAttribute('class')).toContain('border-border');
    expect(content?.getAttribute('class')).toContain('justify-center');
    expect(content?.getAttribute('class')).toContain('gap-3');
    expect(content?.getAttribute('class')).toContain('text-muted-foreground');
    expect(containsDescendant(footer, content)).toBe(true);
    expect(containsDescendant(footer, legend)).toBe(true);
    expect(html).toContain('Was this question helpful?');
    expect(legend?.textContent?.trim()).toBe('Rate this question');
    expect(legend?.getAttribute('class')).toContain('sr-only');
    expect(doc.querySelectorAll('[data-slot="button"]')).toHaveLength(2);
  });
});
