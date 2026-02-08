// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('checkout/success error page', () => {
  it('renders with a valid skip-link target landmark', async () => {
    const CheckoutSuccessError = (await import('./error')).default;
    const error = Object.assign(new Error('boom'), { digest: 'digest_123' });

    const html = renderToStaticMarkup(
      <CheckoutSuccessError error={error} reset={() => {}} />,
    );

    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('Checkout error');
    expect(html).toContain('Error ID: ');
  });
});
