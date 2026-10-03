// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let UnscoredDisclosure: typeof import('./unscored-disclosure').UnscoredDisclosure;

beforeAll(async () => {
  ({ UnscoredDisclosure } = await import('./unscored-disclosure'));
});

// ADR-022 Decision 3: where a score leaves items out, it says so.
describe('UnscoredDisclosure', () => {
  it.each([
    [
      2,
      "2 questions aren't scored: withdrawn, under review, removed mid-session, or their answer was corrected.",
    ],
    [
      1,
      "1 question isn't scored: withdrawn, under review, removed mid-session, or its answer was corrected.",
    ],
  ])('says how many of the questions are not scored (%i)', (count, text) => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(<UnscoredDisclosure count={count} />),
      'text/html',
    );

    expect(doc.body.textContent).toBe(text);
  });

  it('says nothing when every question is scored', () => {
    expect(renderToStaticMarkup(<UnscoredDisclosure count={0} />)).toBe('');
  });
});
