// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type QuestionOrigin, toQuestionRoute } from '@/lib/routes';
import type { PracticeSessionReviewRow } from '@/src/application/use-cases';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const availableRow: PracticeSessionReviewRow = {
  isAvailable: true,
  questionId: 'q1',
  slug: 'q-1',
  stemMd: 'A short stem',
  difficulty: 'easy',
  order: 1,
  isAnswered: true,
  isCorrect: false,
  isOmitted: false,
  markedForReview: false,
};

const correctRow: PracticeSessionReviewRow = {
  ...availableRow,
  questionId: 'q3',
  slug: 'q-3',
  order: 3,
  isCorrect: true,
};

const unavailableRow: PracticeSessionReviewRow = {
  isAvailable: false,
  questionId: 'q2',
  order: 2,
  isAnswered: false,
  isCorrect: null,
  isOmitted: false,
  markedForReview: false,
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
      sessionId: 'session_123',
    });

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('a');

    expect(link?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', {
        from: 'summary',
        mode: 'review',
        sessionId: 'session_123',
      }),
    );
  });

  it('uses background-only hover feedback for available breakdown links', async () => {
    const html = await renderList([availableRow]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('a');

    expect(link).not.toBeNull();
    const linkTokens = getClassTokens(link?.getAttribute('class') ?? '');

    expect(linkTokens.has('hover:bg-muted/20')).toBe(true);
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
    expect(listTokens.has('divide-border/20')).toBe(true);
    expect(listTokens.has('dark:divide-foreground/20')).toBe(true);
  });
});
