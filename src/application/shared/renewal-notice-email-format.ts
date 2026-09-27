export const RENEWAL_NOTICE_FROM =
  'Addiction Boards <notices@addictionboards.com>';
export const RENEWAL_NOTICE_REPLY_TO = 'support@addictionboards.com';
export const RENEWAL_NOTICE_SUPPORT_EMAIL = 'support@addictionboards.com';
// The in-app Billing page; lib/routes.test.ts pins it to ROUTES.APP_BILLING.
export const RENEWAL_NOTICE_BILLING_PATH = '/app/billing';
export const RENEWAL_NOTICE_BUSINESS_CONTACT =
  'John H. Jung, MD, MS, sole proprietor — support@addictionboards.com';

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

const CUTOFF_ZONES = [
  { label: 'Eastern', timeZone: 'America/New_York' },
  { label: 'Pacific', timeZone: 'America/Los_Angeles' },
] as const;

function formatTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeStyle: 'short',
    timeZone,
  }).format(value);
}

function formatMonthDay(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(value);
}

// DEBT-414 F06: a cancellation or trial deadline is an instant. State it in
// UTC, then in US Eastern and Pacific time, naming the local date whenever it
// differs from the UTC date (a deadline on the previous US evening).
export function formatRenewalNoticeCutoff(value: Date): string {
  const utcMonthDay = formatMonthDay(value, 'UTC');
  const local = CUTOFF_ZONES.map(({ label, timeZone }) => {
    const monthDay = formatMonthDay(value, timeZone);
    const time = formatTime(value, timeZone);
    return monthDay === utcMonthDay
      ? `${time} ${label}`
      : `${monthDay} at ${time} ${label}`;
  });
  return `${formatRenewalNoticeDate(value)} at ${formatTime(value, 'UTC')} UTC (${local.join(', ')})`;
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
