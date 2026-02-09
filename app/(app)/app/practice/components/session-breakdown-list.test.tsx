// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('SessionBreakdownList', () => {
  it('renders available questions as links and unavailable questions as plain text', async () => {
    const { SessionBreakdownList } = await import('./session-breakdown-list');

    const longStem = `${'A'.repeat(77)}BBBB`;
    const stemPreview = `${'A'.repeat(77)}...`;

    const html = renderToStaticMarkup(
      <SessionBreakdownList
        rows={[
          {
            isAvailable: true,
            questionId: 'q1',
            slug: 'q-1',
            stemMd: longStem,
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
          {
            isAvailable: false,
            questionId: 'q2',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ]}
      />,
    );

    expect(html).toContain(stemPreview);
    expect(html).not.toContain('BBBB');
    expect(html).toContain('[Question no longer available]');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(
      toQuestionRoute('q-1', { from: 'practice' }),
    );

    expect(html).toContain('Answered');
    expect(html).toContain('Incorrect');
    expect(html).toContain('Unanswered');
  });
});
