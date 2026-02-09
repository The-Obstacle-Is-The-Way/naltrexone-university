// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
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

const unavailableRow: PracticeSessionReviewRow = {
  isAvailable: false,
  questionId: 'q2',
  order: 2,
  isAnswered: false,
  isCorrect: null,
  markedForReview: false,
};

async function renderList(rows: PracticeSessionReviewRow[]) {
  const { SessionBreakdownList } = await import('./session-breakdown-list');
  return renderToStaticMarkup(<SessionBreakdownList rows={rows} />);
}

describe('SessionBreakdownList', () => {
  it('truncates long stems to 80 characters', async () => {
    const longStem = `${'A'.repeat(77)}BBBB`;
    const html = await renderList([{ ...availableRow, stemMd: longStem }]);

    expect(html).toContain(`${'A'.repeat(77)}...`);
    expect(html).not.toContain('BBBB');
  });

  it('renders available questions as clickable links', async () => {
    const html = await renderList([availableRow]);

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', { from: 'practice' }),
    );
  });

  it('renders unavailable questions as plain text with no link', async () => {
    const html = await renderList([unavailableRow]);

    expect(html).toContain('[Question no longer available]');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('a')).toHaveLength(0);
  });

  it('renders answered/unanswered and correct/incorrect status labels', async () => {
    const html = await renderList([availableRow, unavailableRow]);

    expect(html).toContain('Answered');
    expect(html).toContain('Incorrect');
    expect(html).toContain('Unanswered');
  });
});
