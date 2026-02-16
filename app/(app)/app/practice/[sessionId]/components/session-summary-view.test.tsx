// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SessionSummaryView } from './session-summary-view';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

function findStatValue(doc: Document, label: string): string | null {
  const labelEl =
    Array.from(doc.querySelectorAll('div')).find(
      (el) => el.textContent === label,
    ) ?? null;
  return labelEl?.nextElementSibling?.textContent ?? null;
}

describe('SessionSummaryView', () => {
  it('renders percentage for accuracy when answered > 0', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
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

  it('renders — for accuracy when answered is 0', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
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
});
