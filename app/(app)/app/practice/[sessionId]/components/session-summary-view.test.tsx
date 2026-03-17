// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type SessionSummaryViewModule = typeof import('./session-summary-view');

let SessionSummaryView: SessionSummaryViewModule['SessionSummaryView'];

beforeAll(async () => {
  ({ SessionSummaryView } = await import('./session-summary-view'));
});

function findStatValue(doc: Document, label: string): string | null {
  const labelEl =
    Array.from(doc.querySelectorAll('div')).find(
      (el) => el.textContent === label,
    ) ?? null;
  return labelEl?.nextElementSibling?.textContent ?? null;
}

describe('SessionSummaryView', () => {
  it('uses a card heading for the question breakdown section', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          mode: 'tutor',
          questionCount: 8,
          endedAt: '2026-02-07T00:00:00.000Z',
          totals: {
            answered: 8,
            correct: 6,
            accuracy: 0.75,
            durationSeconds: 600,
          },
        }}
        review={null}
        reviewLoadState={{ status: 'idle' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const h2Texts = Array.from(doc.querySelectorAll('h2')).map(
      (element) => element.textContent ?? '',
    );

    expect(h2Texts).toContain('Question breakdown');
  });

  it('renders percentage for accuracy when answered > 0', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          mode: 'tutor',
          questionCount: 8,
          endedAt: '2026-02-07T00:00:00.000Z',
          totals: {
            answered: 8,
            correct: 6,
            accuracy: 0.75,
            durationSeconds: 600,
          },
        }}
        review={null}
        reviewLoadState={{ status: 'idle' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(findStatValue(doc, 'Accuracy')).toBe('75%');
  });

  it('shows 0% for exam summary when answered is zero', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          mode: 'exam',
          questionCount: 10,
          endedAt: '2026-02-07T00:00:00.000Z',
          totals: {
            answered: 0,
            correct: 0,
            accuracy: 0,
            durationSeconds: 0,
          },
        }}
        review={null}
        reviewLoadState={{ status: 'idle' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(findStatValue(doc, 'Accuracy')).toBe('0%');
  });

  it('shows — for tutor summary when answered is zero', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          mode: 'tutor',
          questionCount: 10,
          endedAt: '2026-02-07T00:00:00.000Z',
          totals: {
            answered: 0,
            correct: 0,
            accuracy: 0,
            durationSeconds: 0,
          },
        }}
        review={null}
        reviewLoadState={{ status: 'idle' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(findStatValue(doc, 'Accuracy')).toBe('—');
  });

  it('renders tutor summary primary actions and omits legacy links', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          mode: 'tutor',
          questionCount: 10,
          endedAt: '2026-02-07T00:00:00.000Z',
          totals: {
            answered: 0,
            correct: 0,
            accuracy: 0,
            durationSeconds: 0,
          },
        }}
        review={null}
        reviewLoadState={{ status: 'idle' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionLinks = Array.from(doc.querySelectorAll('a')).filter((link) => {
      const text = link.textContent?.trim();
      return (
        text === 'Back to Practice' ||
        text === 'View in History' ||
        text === 'Back to Dashboard' ||
        text === 'Start another session'
      );
    });

    expect(actionLinks.map((link) => link.textContent?.trim())).toEqual([
      'Back to Practice',
      'View in History',
    ]);
  });

  it('renders exam summary actions when review is available and omits legacy links', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          mode: 'exam',
          questionCount: 2,
          endedAt: '2026-02-07T00:00:00.000Z',
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: 'q1',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionLinks = Array.from(doc.querySelectorAll('a')).filter((link) => {
      const text = link.textContent?.trim();
      return (
        text === 'Review your answers' ||
        text === 'Back to Practice' ||
        text === 'View in History' ||
        text === 'Back to Dashboard' ||
        text === 'Start another session'
      );
    });

    expect(actionLinks.map((link) => link.textContent?.trim())).toEqual([
      'Review your answers',
      'Back to Practice',
      'View in History',
    ]);
  });
});
