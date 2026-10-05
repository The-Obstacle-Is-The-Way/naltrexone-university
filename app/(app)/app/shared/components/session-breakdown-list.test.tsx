// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type QuestionOrigin, toQuestionRoute } from '@/lib/routes';
import type { PracticeSessionReviewRow } from '@/src/application/use-cases';
import { findAnchorByHref } from '@/tests/shared/dom-helpers';

const {
  fixtureQuestion1Id,
  fixtureQuestion2Id,
  fixtureQuestion3Id,
  fixtureSession123Id,
} = vi.hoisted(() => ({
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureQuestion3Id: crypto.randomUUID(),
  fixtureSession123Id: crypto.randomUUID(),
}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const availableRow: PracticeSessionReviewRow = {
  isAvailable: true,
  availability: 'available',
  questionId: fixtureQuestion1Id,
  slug: 'q-1',
  stemMd: 'A short stem',
  difficulty: 'easy',
  order: 1,
  isAnswered: true,
  isCorrect: false,
  isOmitted: false,
  markedForReview: false,
  answerKeyChanged: false,
};

const correctRow: PracticeSessionReviewRow = {
  ...availableRow,
  questionId: fixtureQuestion3Id,
  slug: 'q-3',
  order: 3,
  isCorrect: true,
};

const unavailableRow: PracticeSessionReviewRow = {
  isAvailable: false,
  availability: null,
  questionId: fixtureQuestion2Id,
  order: 2,
  isAnswered: false,
  isCorrect: null,
  isOmitted: false,
  markedForReview: false,
  answerKeyChanged: false,
};

let SessionBreakdownList: typeof import('./session-breakdown-list').SessionBreakdownList;

beforeAll(async () => {
  ({ SessionBreakdownList } = await import('./session-breakdown-list'));
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

async function renderList(
  rows: PracticeSessionReviewRow[],
  props?: {
    from?: QuestionOrigin;
    sessionId?: string;
    historyHref?: string;
    onOpenQuestion?: (questionId: string) => void;
    isQuestionActionPending?: boolean;
  },
) {
  return renderToStaticMarkup(<SessionBreakdownList rows={rows} {...props} />);
}

describe('SessionBreakdownList', () => {
  it('truncates long stems to 80 characters', async () => {
    const longStem = `${'A'.repeat(77)}BBBB`;
    const html = await renderList([{ ...availableRow, stemMd: longStem }]);

    expect(html).toContain(`${'A'.repeat(77)}...`);
    expect(html).not.toContain('BBBB');
  });

  it('omits sessionId from href when sessionId prop is not provided', async () => {
    const html = await renderList([availableRow]);

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', { from: 'practice', mode: 'review' }),
    );
  });

  it('includes sessionId in href when sessionId prop is provided', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const html = await renderList([availableRow], { sessionId });

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', { from: 'practice', mode: 'review', sessionId }),
    );
  });

  it('includes historyHref in href when historyHref prop is provided', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const historyHref = '/app/history?tab=sessions&offset=0&limit=20';
    const html = await renderList([availableRow], {
      from: 'history',
      sessionId,
      historyHref,
    });

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', {
        from: 'history',
        mode: 'review',
        sessionId,
        historyHref,
      }),
    );
  });

  // Pattern Registry F-11: an attempted withdrawn question keeps its review
  // link, and reads Withdrawn before its result, like the Unanswered label.
  it('renders a withdrawn question as a review link labelled Withdrawn', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const html = await renderList(
      [{ ...availableRow, availability: 'withdrawn' }],
      {
        sessionId,
      },
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = findAnchorByHref(
      doc,
      toQuestionRoute('q-1', { from: 'practice', mode: 'review', sessionId }),
    );
    const label = Array.from(doc.querySelectorAll('li span')).find(
      (span) => span.textContent === 'Withdrawn',
    );

    expect(link?.textContent).toContain('A short stem');
    expect(label).toBeDefined();
    expect(link?.contains(label ?? null)).toBe(false);
    expect(label?.classList.contains('text-muted-foreground')).toBe(true);
    // DEBT-498: no score counts it, so it is named, not graded.
    expect(doc.body.textContent).toContain('Not scored');
    expect(doc.body.textContent).not.toContain('Incorrect');
    expect(html).not.toContain('[Question no longer available]');
  });

  // ADR-022 Amendment 2026-10-05 (DEBT-498): an answer graded on a key
  // corrected since is not scored, and says so in a neutral tone.
  it('names an answer graded on a corrected key Not scored, in a neutral tone', async () => {
    const html = await renderList([
      { ...correctRow, answerKeyChanged: true },
      availableRow,
    ]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = Array.from(doc.querySelectorAll('li span')).find(
      (span) => span.textContent === 'Not scored',
    );

    expect(result?.classList.contains('text-muted-foreground')).toBe(true);
    expect(doc.body.textContent).not.toContain('Correct');
    expect(doc.body.textContent).toContain('Incorrect');
  });

  it('labels a withdrawn question Withdrawn in callback mode too', async () => {
    const html = await renderList(
      [{ ...availableRow, availability: 'withdrawn' }],
      {
        onOpenQuestion: () => undefined,
      },
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(
      Array.from(doc.querySelectorAll('li span')).some(
        (span) => span.textContent === 'Withdrawn',
      ),
    ).toBe(true);
  });

  // ADR-022 Decision 1: each state has its own label.
  it.each([
    ['under_review', 'Under review'],
    ['retired', 'Retired'],
  ] as const)('labels a %s question %s', async (availability, label) => {
    const doc = new DOMParser().parseFromString(
      await renderList([{ ...availableRow, availability }]),
      'text/html',
    );

    expect(
      Array.from(doc.querySelectorAll('li span')).map(
        (span) => span.textContent,
      ),
    ).toContain(label);
  });

  // ADR-022 Decision 2: an item the learner never answered names its state
  // only, in place of the generic unavailable text.
  it('names the state of an unanswered item no longer available, with no link', async () => {
    const html = await renderList([
      { ...unavailableRow, availability: 'under_review' },
    ]);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.body.textContent).toContain('This question is under review.');
    expect(html).not.toContain('[Question no longer available]');
    expect(doc.querySelectorAll('a')).toHaveLength(0);
  });

  it('renders unavailable questions as plain text with no link', async () => {
    const html = await renderList([unavailableRow]);

    expect(html).toContain('[Question no longer available]');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('a')).toHaveLength(0);
  });

  it('renders available rows as buttons instead of links when callback mode is provided', async () => {
    const html = await renderList([availableRow], {
      onOpenQuestion: () => undefined,
    });
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelectorAll('a')).toHaveLength(0);
    expect(doc.querySelectorAll('button')).toHaveLength(1);
    expect(doc.querySelector('button')?.textContent).toContain('A short stem');
  });

  it('disables callback-mode buttons while a summary review action is pending', async () => {
    const html = await renderList([availableRow], {
      onOpenQuestion: () => undefined,
      isQuestionActionPending: true,
    });
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('button')?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps unavailable rows static even when callback mode is provided', async () => {
    const html = await renderList([unavailableRow], {
      onOpenQuestion: () => undefined,
    });
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelectorAll('a')).toHaveLength(0);
    expect(doc.querySelectorAll('button')).toHaveLength(0);
    expect(html).toContain('[Question no longer available]');
  });

  it('renders correct/incorrect/unanswered status labels', async () => {
    const html = await renderList([availableRow, correctRow, unavailableRow]);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(html).not.toContain('Answered');

    const incorrectLabel = Array.from(doc.querySelectorAll('span')).find(
      (el) => el.textContent === 'Incorrect',
    );
    if (!incorrectLabel) {
      throw new Error('Expected Incorrect label');
    }
    const incorrectLabelTokens = getClassTokens(
      incorrectLabel.getAttribute('class') ?? '',
    );
    expect(incorrectLabelTokens.has('text-destructive')).toBe(true);

    const correctLabel = Array.from(doc.querySelectorAll('span')).find(
      (el) => el.textContent === 'Correct',
    );
    if (!correctLabel) {
      throw new Error('Expected Correct label');
    }
    const correctLabelTokens = getClassTokens(
      correctLabel.getAttribute('class') ?? '',
    );
    expect(correctLabelTokens.has('text-success')).toBe(true);

    const unansweredLabel = Array.from(doc.querySelectorAll('span')).find(
      (el) => el.textContent === 'Unanswered',
    );
    if (!unansweredLabel) {
      throw new Error('Expected Unanswered label');
    }
    const unansweredLabelTokens = getClassTokens(
      unansweredLabel.getAttribute('class') ?? '',
    );
    expect(unansweredLabelTokens.has('text-muted-foreground')).toBe(true);
    expect(unansweredLabelTokens.has('text-muted-foreground/60')).toBe(false);
  });

  it('renders omitted rows as incorrect instead of unanswered', async () => {
    const html = await renderList([
      {
        ...availableRow,
        isAnswered: false,
        isCorrect: false,
        isOmitted: true,
      },
    ]);

    expect(html).toContain('Incorrect');
    expect(html).not.toContain('Unanswered');
  });

  it('supports configurable origin query parameters for question routes', async () => {
    const html = await renderList([availableRow], { from: 'history' });

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', { from: 'history', mode: 'review' }),
    );
  });

  it('includes summary origin and sessionId in question routes', async () => {
    const html = await renderList([availableRow], {
      from: 'summary',
      sessionId: fixtureSession123Id,
    });

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('a');

    expect(link?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', {
        from: 'summary',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('uses background-only hover feedback for available breakdown links', async () => {
    const html = await renderList([availableRow]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('a');

    expect(link).not.toBeNull();
    const linkTokens = getClassTokens(link?.getAttribute('class') ?? '');

    expect(linkTokens.has('hover:bg-muted/50')).toBe(true);
    expect(linkTokens.has('hover:underline')).toBe(false);
  });

  it('renders an empty-state message when there are no breakdown rows', async () => {
    const html = await renderList([]);

    expect(html).toContain('No questions available for this session.');
    expect(html).toContain('text-sm');
    expect(html).toContain('text-muted-foreground');
  });

  it('uses divided row styling on the list container for scanability', async () => {
    const html = await renderList([availableRow, correctRow]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const list = doc.querySelector('ul');

    expect(list).not.toBeNull();
    const listTokens = getClassTokens(list?.getAttribute('class') ?? '');

    expect(listTokens.has('divide-y')).toBe(true);
    expect(listTokens.has('divide-border/40')).toBe(true);
    expect(listTokens.has('dark:divide-foreground/40')).toBe(true);
  });
});
