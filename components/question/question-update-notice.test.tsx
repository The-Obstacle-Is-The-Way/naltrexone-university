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

  // ADR-022 Decision 4: a key corrected since the learner answered is a
  // clinical caution, not a routine update.
  describe('when the answer key was corrected', () => {
    it('says the attempt is not scored and links to the corrected question', () => {
      const doc = parseHtml(
        renderToStaticMarkup(
          <QuestionUpdateNotice variant="review" slug="q-key" keyCorrected />,
        ),
      );

      const status = doc.querySelector('[role="status"]');
      expect(status?.getAttribute('data-tone')).toBe('caution');
      expect(status?.textContent).toContain(
        'The answer to this question was corrected after you answered.',
      );
      expect(status?.textContent).toContain("This attempt isn't scored.");
      expect(status?.textContent).not.toContain('has been updated');
      expect(findAnchorByHref(doc, toQuestionRoute('q-key'))?.textContent).toBe(
        'Practice the corrected question',
      );
    });

    it('tells a learner in a session that this answer will not be scored', () => {
      const doc = parseHtml(
        renderToStaticMarkup(
          <QuestionUpdateNotice variant="session" keyCorrected />,
        ),
      );

      const status = doc.querySelector('[role="status"]');
      expect(status?.getAttribute('data-tone')).toBe('caution');
      expect(status?.textContent).toContain(
        'The answer to this question was corrected after your session began.',
      );
      expect(status?.textContent).toContain(
        "This session shows the earlier version, so your answer here won't be scored.",
      );
      expect(doc.querySelector('a')).toBeNull();
    });
  });
});
