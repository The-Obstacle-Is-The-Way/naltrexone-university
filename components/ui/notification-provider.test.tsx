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

describe('NotificationProvider', () => {
  it('renders a shared toast region wrapper', () => {
    const html = renderToStaticMarkup(
      <NotificationProvider>
        <div>Child content</div>
      </NotificationProvider>,
    );

    expect(html).toContain('Child content');
    expect(html).toContain('data-testid="app-toast-region"');
  });

  it('uses stronger semantic border tokens for success and error toasts', () => {
    expect(getToastClasses('success')).toContain('border-success/60');
    expect(getToastClasses('error')).toContain('border-destructive');
    expect(getToastClasses('error')).not.toContain('border-destructive/40');
  });

  it('uses dark-mode border token for info toasts', () => {
    expect(getToastClasses('info')).toContain('border-border');
    expect(getToastClasses('info')).toContain('dark:border-foreground/40');
  });
});
