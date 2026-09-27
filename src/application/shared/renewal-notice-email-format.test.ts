import { describe, expect, it } from 'vitest';
import {
  escapeRenewalNoticeHtml,
  formatRenewalNoticeCutoff,
  formatRenewalNoticeDate,
  RENEWAL_NOTICE_BUSINESS_CONTACT,
  RENEWAL_NOTICE_FROM,
  RENEWAL_NOTICE_REPLY_TO,
} from './renewal-notice-email-format';

describe('renewal notice email format', () => {
  it('pins the sender identity', () => {
    expect(RENEWAL_NOTICE_FROM).toBe(
      'Addiction Boards <notices@addictionboards.com>',
    );
  });

  it('pins the reply-to address', () => {
    expect(RENEWAL_NOTICE_REPLY_TO).toBe('support@addictionboards.com');
  });

  it('pins the statutory business contact copy', () => {
    expect(RENEWAL_NOTICE_BUSINESS_CONTACT).toBe(
      'John H. Jung, MD, MS, sole proprietor — support@addictionboards.com',
    );
  });

  it('formats dates in UTC', () => {
    expect(formatRenewalNoticeDate(new Date('2026-08-07T23:30:00-04:00'))).toBe(
      'August 8, 2026',
    );
  });

  it('escapes HTML-significant characters', () => {
    expect(escapeRenewalNoticeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  // DEBT-414 F06: a deadline needs its time and zone, not a UTC date alone.
  it('formats a cutoff with its UTC time and the US Eastern and Pacific times', () => {
    expect(
      formatRenewalNoticeCutoff(new Date('2026-09-06T12:00:00.000Z')),
    ).toBe(
      'September 6, 2026 at 12:00 PM UTC (8:00 AM Eastern, 5:00 AM Pacific)',
    );
  });

  it('names the local date when a cutoff falls on the previous US evening', () => {
    expect(
      formatRenewalNoticeCutoff(new Date('2026-09-06T02:00:00.000Z')),
    ).toBe(
      'September 6, 2026 at 2:00 AM UTC (September 5 at 10:00 PM Eastern, September 5 at 7:00 PM Pacific)',
    );
  });
});
