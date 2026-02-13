// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
  markedForReview: false,
};

async function renderList(
  rows: PracticeSessionReviewRow[],
  props?: { from?: QuestionOrigin; sessionId?: string },
) {
  const { SessionBreakdownList } = await import('./session-breakdown-list');
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

  it('renders unavailable questions as plain text with no link', async () => {
    const html = await renderList([unavailableRow]);

    expect(html).toContain('[Question no longer available]');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('a')).toHaveLength(0);
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
    expect(incorrectLabel.getAttribute('class')).toContain('text-destructive');

    const correctLabel = Array.from(doc.querySelectorAll('span')).find(
      (el) => el.textContent === 'Correct',
    );
    if (!correctLabel) {
      throw new Error('Expected Correct label');
    }
    expect(correctLabel.getAttribute('class')).toContain('text-emerald-500');

    const unansweredLabel = Array.from(doc.querySelectorAll('span')).find(
      (el) => el.textContent === 'Unanswered',
    );
    if (!unansweredLabel) {
      throw new Error('Expected Unanswered label');
    }
    expect(unansweredLabel.getAttribute('class')).toContain(
      'text-muted-foreground/60',
    );
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
});
