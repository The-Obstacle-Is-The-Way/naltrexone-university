// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

type QuestionFeedbackRatingModule = typeof import('./question-feedback-rating');

let QuestionFeedbackRating: QuestionFeedbackRatingModule['QuestionFeedbackRating'];

beforeAll(async () => {
  ({ QuestionFeedbackRating } = await import('./question-feedback-rating'));
});

function renderRating(
  overrides: Partial<Parameters<typeof QuestionFeedbackRating>[0]> = {},
) {
  const html = renderToStaticMarkup(
    <QuestionFeedbackRating
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

describe('QuestionFeedbackRating', () => {
  it('renders the rating row with a labelled group and icon buttons', () => {
    const { html, doc } = renderRating();
    const group = doc.querySelector('fieldset');
    const legend = group?.querySelector('legend');
    const helpfulButton = doc.querySelector(
      'button[aria-label="Mark as helpful"]',
    );
    const notHelpfulButton = doc.querySelector(
      'button[aria-label="Mark as not helpful"]',
    );

    expect(html).toContain('Was this question helpful?');
    expect(legend?.textContent?.trim()).toBe('Rate this question');
    expect(legend?.getAttribute('class')).toContain('sr-only');
    expect(helpfulButton?.getAttribute('data-slot')).toBe('button');
    expect(notHelpfulButton?.getAttribute('data-slot')).toBe('button');
    expect(helpfulButton?.getAttribute('aria-pressed')).toBe('false');
    expect(notHelpfulButton?.getAttribute('aria-pressed')).toBe('false');
    expect(helpfulButton?.getAttribute('data-variant')).toBe('outline');
    expect(notHelpfulButton?.getAttribute('data-variant')).toBe('outline');
  });

  it('marks the active helpful rating and exposes polite save status text', () => {
    const { doc } = renderRating({
      rating: 'helpful',
      feedbackStatus: 'saved',
    });
    const helpfulButton = doc.querySelector(
      'button[aria-label="Mark as helpful"]',
    );
    const status = doc.querySelector('[aria-live="polite"]');

    expect(helpfulButton?.getAttribute('aria-pressed')).toBe('true');
    expect(helpfulButton?.getAttribute('data-variant')).toBe('success');
    expect(status?.textContent?.trim()).toBe('Rating saved');
    expect(status?.getAttribute('class')).toContain('text-muted-foreground');
  });

  it('marks the active not-helpful rating and renders the failure state accessibly', () => {
    const { doc } = renderRating({
      rating: 'not_helpful',
      feedbackStatus: 'error',
    });
    const notHelpfulButton = doc.querySelector(
      'button[aria-label="Mark as not helpful"]',
    );
    const status = doc.querySelector('[aria-live="polite"]');

    expect(notHelpfulButton?.getAttribute('aria-pressed')).toBe('true');
    expect(notHelpfulButton?.getAttribute('data-variant')).toBe('destructive');
    expect(status?.textContent?.trim()).toBe("Couldn't save rating");
    expect(status?.getAttribute('class')).toContain('text-destructive');
  });

  it('disables both thumbs while saving', () => {
    const { doc } = renderRating({ feedbackStatus: 'saving' });
    const buttons = Array.from(doc.querySelectorAll('button'));
    const status = doc.querySelector('[aria-live="polite"]');

    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(
      true,
    );
    expect(status?.textContent?.trim()).toBe('Saving rating');
  });
});
