import { describe, expect, it } from 'vitest';
import { SUPPORT_EMAIL, supportMailtoHref } from './support';

// BUG-326: error pages send people to support by email, the address the
// privacy policy names, never to a public issue tracker.
describe('supportMailtoHref', () => {
  it('addresses support with the page and the error ID in the subject', () => {
    const href = supportMailtoHref({
      page: 'Billing',
      errorId: 'digest-123',
    });

    expect(SUPPORT_EMAIL).toBe('support@addictionboards.com');
    expect(href).toBe(
      `mailto:support@addictionboards.com?subject=${encodeURIComponent(
        'Addiction Boards support: Billing (error ID digest-123)',
      )}`,
    );
  });

  it('leaves the error ID out when there is none', () => {
    expect(supportMailtoHref({ page: 'Something went wrong' })).toBe(
      `mailto:support@addictionboards.com?subject=${encodeURIComponent(
        'Addiction Boards support: Something went wrong',
      )}`,
    );
  });
});
