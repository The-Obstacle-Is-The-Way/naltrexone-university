import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_AND_REFUND_POLICY,
  escapeRenewalNoticeHtml,
  formatRenewalNoticeCutoff,
  formatRenewalNoticeDate,
  RENEWAL_NOTICE_BUSINESS_CONTACT,
  RENEWAL_NOTICE_FROM,
  RENEWAL_NOTICE_REPLY_TO,
  renderRenewalNoticeHtml,
  renderRenewalNoticeText,
  renewalNoticeLink,
} from './renewal-notice-email-format';

const lines = [
  [
    'Manage it on ',
    renewalNoticeLink('https://example.com/billing?a=1&b=2'),
    '.',
  ],
  ['Questions: <support>'],
] as const;

describe('renewal notice rendering', () => {
  it('renders one line per line of text, with each link as its URL', () => {
    expect(renderRenewalNoticeText(lines)).toBe(
      'Manage it on https://example.com/billing?a=1&b=2.\nQuestions: <support>',
    );
  });

  it('renders one paragraph per line in HTML, with escaped anchors', () => {
    expect(renderRenewalNoticeHtml(lines)).toBe(
      '<p>Manage it on <a href="https://example.com/billing?a=1&amp;b=2">https://example.com/billing?a=1&amp;b=2</a>.</p><p>Questions: &lt;support&gt;</p>',
    );
  });
});

describe('renewal notice email format', () => {
  it('pins the sender identity', () => {
    expect(RENEWAL_NOTICE_FROM).toBe(
      'Addiction Boards <notices@addictionboards.com>',
    );
  });

  it('quotes the Terms § 4 cancellation and refund policy', () => {
    expect(CANCELLATION_AND_REFUND_POLICY).toBe(
      'Cancellation takes effect at the end of the current trial or paid billing period; you keep access until then. Except where the law requires otherwise, payments are non-refundable.',
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
    ).toBe('September 6, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT)');
  });

  it('names standard time outside daylight saving time', () => {
    expect(
      formatRenewalNoticeCutoff(new Date('2027-01-15T12:00:00.000Z')),
    ).toBe('January 15, 2027 at 12:00 PM UTC (7:00 AM EST, 4:00 AM PST)');
  });

  // #1155 review: a US evening before a UTC new year is in the previous year.
  it('names the local year when a cutoff falls on the previous US new year eve', () => {
    expect(
      formatRenewalNoticeCutoff(new Date('2027-01-01T02:00:00.000Z')),
    ).toBe(
      'January 1, 2027 at 2:00 AM UTC (December 31, 2026 at 9:00 PM EST, December 31, 2026 at 6:00 PM PST)',
    );
  });

  // #1155 review: 1:30 AM Eastern happens twice on the night clocks fall back,
  // so each local time carries its zone abbreviation.
  it('distinguishes both occurrences of the repeated fall-back hour', () => {
    expect(
      formatRenewalNoticeCutoff(new Date('2026-11-01T05:30:00.000Z')),
    ).toBe(
      'November 1, 2026 at 5:30 AM UTC (1:30 AM EDT, October 31 at 10:30 PM PDT)',
    );
    expect(
      formatRenewalNoticeCutoff(new Date('2026-11-01T06:30:00.000Z')),
    ).toBe(
      'November 1, 2026 at 6:30 AM UTC (1:30 AM EST, October 31 at 11:30 PM PDT)',
    );
  });

  it('names the local date when a cutoff falls on the previous US evening', () => {
    expect(
      formatRenewalNoticeCutoff(new Date('2026-09-06T02:00:00.000Z')),
    ).toBe(
      'September 6, 2026 at 2:00 AM UTC (September 5 at 10:00 PM EDT, September 5 at 7:00 PM PDT)',
    );
  });
});
