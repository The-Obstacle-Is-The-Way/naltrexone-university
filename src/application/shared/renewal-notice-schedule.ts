import { DAY_MS } from '@/src/domain/services';

// DEBT-414 F01/F07: every covered state's annual-notice window contains 30-40
// days before renewal (CO 25-40; VT, IL, DE, GA, HI 30-60; CA, NY 15-45).
// A renewal reminder is never sent later than this minimum.
export const RENEWAL_NOTICE_MINIMUM_DAYS = 30;

export function renewalNoticeSendByCutoff(renewalAt: Date): Date {
  return new Date(renewalAt.getTime() - RENEWAL_NOTICE_MINIMUM_DAYS * DAY_MS);
}
