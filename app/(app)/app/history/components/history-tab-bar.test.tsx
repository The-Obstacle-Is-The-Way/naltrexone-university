// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import { HistoryTabBar } from './history-tab-bar';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

function getLinks(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('a'));
}

describe('HistoryTabBar', () => {
  it('renders Sessions and Missed Questions links', () => {
    const html = renderToStaticMarkup(<HistoryTabBar activeTab="sessions" />);
    const links = getLinks(html);

    const sessions = links.find((l) => l.textContent === 'Sessions');
    const missed = links.find((l) => l.textContent === 'Missed Questions');

    expect(sessions?.getAttribute('href')).toBe(
      `${ROUTES.APP_HISTORY}?tab=sessions`,
    );
    expect(missed?.getAttribute('href')).toBe(
      `${ROUTES.APP_HISTORY}?tab=missed`,
    );
  });

  it('marks the active tab with aria-current="page"', () => {
    const sessionsHtml = renderToStaticMarkup(
      <HistoryTabBar activeTab="sessions" />,
    );
    const sessionsLinks = getLinks(sessionsHtml);
    const sessions = sessionsLinks.find((l) => l.textContent === 'Sessions');
    const missed = sessionsLinks.find(
      (l) => l.textContent === 'Missed Questions',
    );

    expect(sessions?.getAttribute('aria-current')).toBe('page');
    expect(missed?.getAttribute('aria-current')).toBeNull();

    const missedHtml = renderToStaticMarkup(
      <HistoryTabBar activeTab="missed" />,
    );
    const missedLinks = getLinks(missedHtml);
    const sessions2 = missedLinks.find((l) => l.textContent === 'Sessions');
    const missed2 = missedLinks.find(
      (l) => l.textContent === 'Missed Questions',
    );

    expect(missed2?.getAttribute('aria-current')).toBe('page');
    expect(sessions2?.getAttribute('aria-current')).toBeNull();
  });
});
