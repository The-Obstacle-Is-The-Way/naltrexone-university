// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('App route loading UIs', () => {
  it('renders app layout loading UI', async () => {
    const Loading = (await import('./loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading app');
  });

  it('renders dashboard loading UI', async () => {
    const Loading = (await import('./dashboard/loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading dashboard');
  });

  it('renders practice loading UI', async () => {
    const Loading = (await import('./practice/loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading practice');
  });

  it('renders practice session loading UI', async () => {
    const Loading = (await import('./practice/[sessionId]/loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading practice session');
  });

  it('renders history loading UI', async () => {
    const Loading = (await import('./history/loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading history');
  });

  it('renders bookmarks loading UI', async () => {
    const Loading = (await import('./bookmarks/loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading bookmarks');
  });

  it('renders billing loading UI', async () => {
    const Loading = (await import('./billing/loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading billing');
  });

  it('renders question loading UI', async () => {
    const Loading = (await import('./questions/[slug]/loading')).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('Loading question');
  });
});
