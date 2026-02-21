// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';

let HistoryTabBar: typeof import('./history-tab-bar').HistoryTabBar;

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

beforeAll(async () => {
  ({ HistoryTabBar } = await import('./history-tab-bar'));
});

function getLinks(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('a'));
}

function getContainer(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector('nav > div');
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

  it('renders nav landmark with an accessible label', () => {
    const html = renderToStaticMarkup(<HistoryTabBar activeTab="sessions" />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nav = doc.querySelector('nav');

    expect(nav?.getAttribute('aria-label')).toBe('History tabs');
  });

  it('uses canonical container classes and removes legacy history-only container tokens', () => {
    const html = renderToStaticMarkup(<HistoryTabBar activeTab="sessions" />);
    const containerClass = getContainer(html)?.getAttribute('class') ?? '';

    expect(containerClass).toContain(
      'inline-flex rounded-lg border border-border bg-muted p-1',
    );
    expect(containerClass).not.toContain('rounded-full');
    expect(containerClass).not.toContain('bg-muted/20');
    expect(containerClass).not.toContain('border-border/60');
    expect(containerClass).not.toContain('items-center');
    expect(containerClass).not.toContain('gap-1');
  });

  it('uses high-contrast active styling instead of background-on-background active styling', () => {
    const html = renderToStaticMarkup(<HistoryTabBar activeTab="sessions" />);

    expect(html).toContain('bg-primary text-primary-foreground shadow-sm');
    expect(html).not.toContain('bg-background text-foreground shadow-sm');
  });
});
