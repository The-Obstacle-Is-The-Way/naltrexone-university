// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { findMainLandmarkById, parseHtml } from '@/tests/shared/dom-helpers';

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
    const doc = parseHtml(html);
    const main = findMainLandmarkById(doc, 'main-content');

    expect(main).not.toBeNull();
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(html).toContain('Checkout error');
    expect(html).toContain('Error ID: ');
  });
});
