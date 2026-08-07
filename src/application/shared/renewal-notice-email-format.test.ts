import { describe, expect, it } from 'vitest';
import {
  escapeRenewalNoticeHtml,
  formatRenewalNoticeDate,
  RENEWAL_NOTICE_BUSINESS_CONTACT,
  RENEWAL_NOTICE_FROM,
  RENEWAL_NOTICE_REPLY_TO,
} from './renewal-notice-email-format';

describe('renewal notice email format', () => {
  it('pins sender identity, statutory contact copy, UTC dates, and HTML escaping', () => {
    expect(RENEWAL_NOTICE_FROM).toBe(
      'Addiction Boards <notices@addictionboards.com>',
    );
    expect(RENEWAL_NOTICE_REPLY_TO).toBe('support@addictionboards.com');
    expect(RENEWAL_NOTICE_BUSINESS_CONTACT).toBe(
      'John H. Jung, MD, MS, sole proprietor — support@addictionboards.com',
    );
    expect(formatRenewalNoticeDate(new Date('2026-08-07T23:30:00-04:00'))).toBe(
      'August 8, 2026',
    );
    expect(escapeRenewalNoticeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});
