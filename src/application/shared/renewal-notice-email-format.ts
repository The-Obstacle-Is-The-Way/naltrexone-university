export const RENEWAL_NOTICE_FROM =
  'Addiction Boards <notices@addictionboards.com>';
export const RENEWAL_NOTICE_REPLY_TO = 'support@addictionboards.com';
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
