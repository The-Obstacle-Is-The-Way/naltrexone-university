// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let StickyActionBar: typeof import('./sticky-action-bar').StickyActionBar;
let StickyActionBarLayout: typeof import('./sticky-action-bar').StickyActionBarLayout;

beforeAll(async () => {
  ({ StickyActionBar, StickyActionBarLayout } = await import(
    './sticky-action-bar'
  ));
});

describe('StickyActionBar', () => {
  it('renders the shared layout markers around scrollable content and the sticky footer', () => {
    const html = renderToStaticMarkup(
      <StickyActionBarLayout
        actionBar={<div data-testid="bottom-action-bar">Actions</div>}
      >
        <article data-testid="sticky-layout-content">Content</article>
      </StickyActionBarLayout>,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const layout = doc.querySelector(
      '[data-testid="sticky-action-bar-layout"]',
    );
    const scrollRegion = doc.querySelector(
      '[data-testid="sticky-action-bar-scroll-region"]',
    );
    const wrapper = doc.querySelector('[data-testid="sticky-action-bar"]');
    const content = doc.querySelector('[data-testid="sticky-layout-content"]');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');

    expect(layout).not.toBeNull();
    expect(scrollRegion).not.toBeNull();
    expect(wrapper).not.toBeNull();
    expect(content).not.toBeNull();
    expect(actionBar).not.toBeNull();
    expect(layout?.contains(scrollRegion)).toBe(true);
    expect(layout?.contains(wrapper)).toBe(true);
    expect(scrollRegion?.contains(content)).toBe(true);
    expect(wrapper?.contains(actionBar)).toBe(true);
    expect(layout?.className).toContain('flex');
    expect(layout?.className).toContain('flex-1');
    expect(layout?.className).toContain('min-h-0');
    expect(layout?.className).toContain('overflow-hidden');
    expect(scrollRegion?.className).toContain('overflow-y-auto');
  });

  it('renders children inside the shared sticky shell', () => {
    const html = renderToStaticMarkup(
      <StickyActionBar>
        <div data-testid="bottom-action-bar">Actions</div>
      </StickyActionBar>,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrapper = doc.querySelector('[data-testid="sticky-action-bar"]');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');

    expect(wrapper).not.toBeNull();
    expect(actionBar).not.toBeNull();
    expect(wrapper?.className).toContain('sticky');
    expect(wrapper?.className).toContain('bottom-0');
    expect(wrapper?.contains(actionBar)).toBe(true);
  });
});
