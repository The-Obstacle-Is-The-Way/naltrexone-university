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
  it('renders Sessions and Questions links', () => {
    const html = renderToStaticMarkup(<HistoryTabBar activeTab="sessions" />);
    const links = getLinks(html);

    const sessions = links.find((l) => l.textContent === 'Sessions');
    const questions = links.find((l) => l.textContent === 'Questions');

    expect(sessions?.getAttribute('href')).toBe(
      `${ROUTES.APP_HISTORY}?tab=sessions`,
    );
    expect(questions?.getAttribute('href')).toBe(
      `${ROUTES.APP_HISTORY}?tab=questions`,
    );
  });

  it('marks the active tab with aria-current="page"', () => {
    const sessionsHtml = renderToStaticMarkup(
      <HistoryTabBar activeTab="sessions" />,
    );
    const sessionsLinks = getLinks(sessionsHtml);
    const sessions = sessionsLinks.find((l) => l.textContent === 'Sessions');
    const questions = sessionsLinks.find((l) => l.textContent === 'Questions');

    expect(sessions?.getAttribute('aria-current')).toBe('page');
    expect(questions?.getAttribute('aria-current')).toBeNull();

    const questionsHtml = renderToStaticMarkup(
      <HistoryTabBar activeTab="questions" />,
    );
    const questionsLinks = getLinks(questionsHtml);
    const sessions2 = questionsLinks.find((l) => l.textContent === 'Sessions');
    const questions2 = questionsLinks.find(
      (l) => l.textContent === 'Questions',
    );

    expect(questions2?.getAttribute('aria-current')).toBe('page');
    expect(sessions2?.getAttribute('aria-current')).toBeNull();
  });
});
