// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

type LoadingModule = Awaited<typeof import('./loading')>['default'];

let AppLoading: LoadingModule;
let DashboardLoading: Awaited<typeof import('./dashboard/loading')>['default'];
let PracticeLoading: Awaited<typeof import('./practice/loading')>['default'];
let PracticeSessionLoading: Awaited<
  typeof import('./practice/[sessionId]/loading')
>['default'];
let HistoryLoading: Awaited<typeof import('./history/loading')>['default'];
let BookmarksLoading: Awaited<typeof import('./bookmarks/loading')>['default'];
let BillingLoading: Awaited<typeof import('./billing/loading')>['default'];
let QuestionLoading: Awaited<
  typeof import('./questions/[slug]/loading')
>['default'];

describe('App route loading UIs', () => {
  beforeAll(async () => {
    [
      AppLoading,
      DashboardLoading,
      PracticeLoading,
      PracticeSessionLoading,
      HistoryLoading,
      BookmarksLoading,
      BillingLoading,
      QuestionLoading,
    ] = await Promise.all([
      import('./loading').then((module) => module.default),
      import('./dashboard/loading').then((module) => module.default),
      import('./practice/loading').then((module) => module.default),
      import('./practice/[sessionId]/loading').then((module) => module.default),
      import('./history/loading').then((module) => module.default),
      import('./bookmarks/loading').then((module) => module.default),
      import('./billing/loading').then((module) => module.default),
      import('./questions/[slug]/loading').then((module) => module.default),
    ]);
  });

  it('renders app layout loading UI', () => {
    const html = renderToStaticMarkup(<AppLoading />);
    expect(html).toContain('Loading app');
  });

  it('renders dashboard loading UI', () => {
    const html = renderToStaticMarkup(<DashboardLoading />);
    expect(html).toContain('Loading dashboard');
  });

  it('renders practice loading UI', () => {
    const html = renderToStaticMarkup(<PracticeLoading />);
    expect(html).toContain('Loading practice');
  });

  it('renders practice session loading UI', () => {
    const html = renderToStaticMarkup(<PracticeSessionLoading />);
    expect(html).toContain('Loading practice session');
  });

  it('renders history loading UI', () => {
    const html = renderToStaticMarkup(<HistoryLoading />);
    expect(html).toContain('Loading history');
  });

  it('renders bookmarks loading UI', () => {
    const html = renderToStaticMarkup(<BookmarksLoading />);
    expect(html).toContain('Loading bookmarks');
  });

  it('renders billing loading UI', () => {
    const html = renderToStaticMarkup(<BillingLoading />);
    expect(html).toContain('Loading billing');
  });

  it('renders question loading UI', () => {
    const html = renderToStaticMarkup(<QuestionLoading />);
    expect(html).toContain('Loading question');
  });
});
