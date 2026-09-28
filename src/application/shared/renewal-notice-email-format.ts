export const RENEWAL_NOTICE_FROM =
  'Addiction Boards <notices@addictionboards.com>';
export const RENEWAL_NOTICE_REPLY_TO = 'support@addictionboards.com';
export const RENEWAL_NOTICE_SUPPORT_EMAIL = 'support@addictionboards.com';
// The in-app Billing page; lib/routes.test.ts pins it to ROUTES.APP_BILLING.
export const RENEWAL_NOTICE_BILLING_PATH = '/app/billing';
export const RENEWAL_NOTICE_BUSINESS_CONTACT =
  'John H. Jung, MD, MS, sole proprietor — support@addictionboards.com';
// The cancellation and refund policy quoted from Terms § 4 (DEBT-414 F06,
// F15): stated next to consent, in the acknowledgment and in every notice.
export const CANCELLATION_AND_REFUND_POLICY =
  'Cancellation takes effect at the end of the current trial or paid billing period; you keep access until then. Except where the law requires otherwise, payments are non-refundable.';

export function escapeRenewalNoticeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatRenewalNoticeDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

const CUTOFF_TIME_ZONES = ['America/New_York', 'America/Los_Angeles'] as const;

// The zone abbreviation (UTC, EDT, EST, PDT, PST) tells the two 1:30 AM
// instants of a fall-back night apart.
function formatTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(value);
}

function formatMonthDay(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(value);
}

function formatYear(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(
    value,
  );
}

// DEBT-414 F06: a cancellation or trial deadline is an instant. State it in
// UTC, then in US Eastern and Pacific time, naming the local date whenever it
// differs from the UTC date (a deadline on the previous US evening), with its
// year when that differs too (the evening before a UTC new year).
export function formatRenewalNoticeCutoff(value: Date): string {
  const utcMonthDay = formatMonthDay(value, 'UTC');
  const utcYear = formatYear(value, 'UTC');
  const local = CUTOFF_TIME_ZONES.map((timeZone) => {
    const monthDay = formatMonthDay(value, timeZone);
    const year = formatYear(value, timeZone);
    const time = formatTime(value, timeZone);
    if (monthDay === utcMonthDay) return time;
    return year === utcYear
      ? `${monthDay} at ${time}`
      : `${monthDay}, ${year} at ${time}`;
  });
  return `${formatRenewalNoticeDate(value)} at ${formatTime(value, 'UTC')} (${local.join(', ')})`;
}

// A notice line mixes text with links; links render as anchors in HTML and as
// their URL in text, so both parts of the email carry working routes.
export type RenewalNoticeLine = readonly (
  | string
  | { href: string; label: string }
)[];

export function renderRenewalNoticeText(
  lines: readonly RenewalNoticeLine[],
): string {
  return lines
    .map((line) =>
      line
        .map((part) => (typeof part === 'string' ? part : part.label))
        .join(''),
    )
    .join('\n');
}

export function renderRenewalNoticeHtml(
  lines: readonly RenewalNoticeLine[],
): string {
  return lines
    .map(
      (line) =>
        `<p>${line
          .map((part) =>
            typeof part === 'string'
              ? escapeRenewalNoticeHtml(part)
              : `<a href="${escapeRenewalNoticeHtml(part.href)}">${escapeRenewalNoticeHtml(part.label)}</a>`,
          )
          .join('')}</p>`,
    )
    .join('');
}

export function renewalNoticeLink(href: string): {
  href: string;
  label: string;
} {
  return { href, label: href };
}
