// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import {
  findAnchorByHref,
  findElementByText,
  parseHtml,
} from '@/tests/shared/dom-helpers';

let QuestionUpdateNotice: typeof import('./question-update-notice').QuestionUpdateNotice;

beforeAll(async () => {
  QuestionUpdateNotice = (await import('./question-update-notice'))
    .QuestionUpdateNotice;
});

describe('QuestionUpdateNotice (Pattern Registry F-12)', () => {
  it('says the question was updated since the learner saw it, as a polite status', () => {
    const doc = parseHtml(
      renderToStaticMarkup(
        <QuestionUpdateNotice variant="review" slug="q-updated" />,
      ),
    );

    const status = doc.querySelector('[role="status"]');
    expect(status?.textContent).toContain('This question has been updated.');
    expect(status?.textContent).toContain(
      'This is the version you saw. Its answer or explanation may have changed.',
    );
    expect(
      findElementByText(doc, 'p', 'This question has been updated.'),
    ).not.toBeNull();
  });

  it('links to the current version of the question', () => {
    const doc = parseHtml(
      renderToStaticMarkup(
        <QuestionUpdateNotice variant="review" slug="q-updated" />,
      ),
    );

    const link = findAnchorByHref(doc, toQuestionRoute('q-updated'));
    expect(link?.textContent).toBe('Practice the current version');
    expect(link?.className).toContain('ring-focus');
  });

  it('tells a learner in a session that it keeps the version shown, without leaving it', () => {
    const doc = parseHtml(
      renderToStaticMarkup(<QuestionUpdateNotice variant="session" />),
    );

    const status = doc.querySelector('[role="status"]');
    expect(status?.textContent).toContain(
      'This question has been updated since your session began.',
    );
    expect(status?.textContent).toContain(
      'This session uses the version shown here. Its answer or explanation may have changed.',
    );
    expect(doc.querySelector('a')).toBeNull();
  });
});
