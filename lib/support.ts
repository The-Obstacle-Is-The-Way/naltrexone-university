// BUG-326: error pages send people to support by email, the address the
// privacy policy names, with the page and error ID so support can find the
// event. Never a public issue tracker: a failed payment is not public business.
export const SUPPORT_EMAIL = 'support@addictionboards.com';

export function supportMailtoHref(input: {
  page: string;
  errorId?: string | undefined;
}): string {
  const subject = input.errorId
    ? `Addiction Boards support: ${input.page} (error ID ${input.errorId})`
    : `Addiction Boards support: ${input.page}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
