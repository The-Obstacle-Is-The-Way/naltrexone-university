// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let BillingError: typeof import('./error').default;

beforeAll(async () => {
  BillingError = (await import('./error')).default;
});

describe('app/(app)/app/billing/error', () => {
  it('renders a contextual error boundary', () => {
    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';

    const html = renderToStaticMarkup(
      <BillingError error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');

    expect(html).toContain('Billing');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  });
});
