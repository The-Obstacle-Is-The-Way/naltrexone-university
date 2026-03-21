// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let NotificationProvider: typeof import('./notification-provider').NotificationProvider;
let getToastClasses: typeof import('./notification-provider').getToastClasses;

beforeAll(async () => {
  ({ NotificationProvider, getToastClasses } = await import(
    './notification-provider'
  ));
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function getToastRegionClassName(html: string): string {
  return (
    new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('[data-testid="app-toast-region"]')
      ?.getAttribute('class') ?? ''
  );
}

describe('NotificationProvider', () => {
  it('renders a shared toast region wrapper', () => {
    const html = renderToStaticMarkup(
      <NotificationProvider>
        <div>Child content</div>
      </NotificationProvider>,
    );
    const className = getToastRegionClassName(html);
    const classTokens = getClassTokens(className);

    expect(html).toContain('Child content');
    expect(html).toContain('data-testid="app-toast-region"');
    expect(classTokens.has('bottom-4')).toBe(true);
    expect(classTokens.has('top-4')).toBe(false);
  });

  it('uses stronger semantic border tokens for success and error toasts', () => {
    const successTokens = getClassTokens(getToastClasses('success'));
    const errorTokens = getClassTokens(getToastClasses('error'));

    expect(successTokens.has('border-success/60')).toBe(true);
    expect(errorTokens.has('border-destructive')).toBe(true);
    expect(errorTokens.has('border-destructive/40')).toBe(false);
  });

  it('uses dark-mode border token for info toasts', () => {
    const infoTokens = getClassTokens(getToastClasses('info'));

    expect(infoTokens.has('border-border')).toBe(true);
    expect(infoTokens.has('dark:border-foreground/40')).toBe(true);
  });
});
