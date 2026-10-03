// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseHtml } from '@/tests/shared/dom-helpers';

let module: typeof import('./question-availability-notice');

beforeAll(async () => {
  module = await import('./question-availability-notice');
});

function statusOf(html: string) {
  const status = parseHtml(html).querySelector('[role="status"]');
  if (!status) throw new Error('Expected a status notice');
  return status;
}

// ADR-022 Decision 1, Pattern Registry F-11.
describe('QuestionAvailabilityNotice', () => {
  it.each([
    [
      'withdrawn',
      'This question was withdrawn.',
      "Its answer and explanation may be inaccurate or outdated, so don't rely on them.",
    ],
    [
      'under_review',
      'This question is under review.',
      "Its answer or explanation may change, so don't rely on them until it returns.",
    ],
    [
      'retired',
      'This question has been retired from the bank.',
      'You can still review your answer.',
    ],
  ] as const)(
    'names a %s question and says what to do, as a polite status',
    (availability, heading, body) => {
      const status = statusOf(
        renderToStaticMarkup(
          <module.QuestionAvailabilityNotice availability={availability} />,
        ),
      );

      expect(
        Array.from(status.querySelectorAll('p')).map((p) => p.textContent),
      ).toEqual([heading, body]);
    },
  );

  // A caution where the content may be wrong; a retired question's content
  // was not found wrong, so its notice is neutral.
  it.each([
    ['withdrawn', 'caution'],
    ['under_review', 'caution'],
    ['retired', 'neutral'],
  ] as const)('gives a %s notice the %s tone', (availability, tone) => {
    const status = statusOf(
      renderToStaticMarkup(
        <module.QuestionAvailabilityNotice availability={availability} />,
      ),
    );

    expect(status.getAttribute('data-tone')).toBe(tone);
  });

  // ADR-022 Decision 2: an item the learner never answered shows its label
  // only: there is no content to caution against.
  it('names the state alone for an item the learner never answered', () => {
    const status = statusOf(
      renderToStaticMarkup(
        <module.QuestionAvailabilityNotice
          availability="withdrawn"
          labelOnly
        />,
      ),
    );

    expect(
      Array.from(status.querySelectorAll('p')).map((p) => p.textContent),
    ).toEqual(['This question was withdrawn.']);
    expect(status.getAttribute('data-tone')).toBe('neutral');
  });

  it.each([
    ['withdrawn', 'Withdrawn'],
    ['under_review', 'Under review'],
    ['retired', 'Retired'],
  ] as const)('labels a %s question %s', (availability, label) => {
    expect(module.questionAvailabilityLabel(availability)).toBe(label);
  });

  it.each([
    ['withdrawn', 'This question was withdrawn.'],
    ['under_review', 'This question is under review.'],
    ['retired', 'This question has been retired from the bank.'],
  ] as const)(
    'names a %s question in a sentence: %s',
    (availability, heading) => {
      expect(module.questionAvailabilityHeading(availability)).toBe(heading);
    },
  );
});
