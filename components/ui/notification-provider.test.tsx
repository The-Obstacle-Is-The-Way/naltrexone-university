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
});
