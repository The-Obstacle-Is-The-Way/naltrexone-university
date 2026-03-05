// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('NotificationProvider', () => {
  it('renders a shared toast region wrapper', async () => {
    const { NotificationProvider } = await import('./notification-provider');

    const html = renderToStaticMarkup(
      <NotificationProvider>
        <div>Child content</div>
      </NotificationProvider>,
    );

    expect(html).toContain('Child content');
    expect(html).toContain('data-testid="app-toast-region"');
  });

  it('uses stronger semantic border tokens for success and error toasts', async () => {
    const { getToastClasses } = await import('./notification-provider');

    expect(getToastClasses('success')).toContain('border-success/60');
    expect(getToastClasses('error')).toContain('border-destructive');
    expect(getToastClasses('error')).not.toContain('border-destructive/40');
  });
});
