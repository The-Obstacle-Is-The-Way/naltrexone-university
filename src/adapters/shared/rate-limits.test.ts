import { describe, expect, it } from 'vitest';
import {
  CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT,
  ONE_MINUTE_MS,
  QUESTION_RATING_RATE_LIMIT,
  QUESTION_REPORT_RATE_LIMIT,
} from './rate-limits';

describe('renewal notice cron rate limit', () => {
  it('fails closed behind the maintenance-route five-per-minute limit', () => {
    expect(CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT).toEqual({
      limit: 5,
      windowMs: ONE_MINUTE_MS,
    });
  });
});

describe('question feedback rate limits', () => {
  it('allows lightweight rating actions at bookmark-toggle scale', () => {
    expect(QUESTION_RATING_RATE_LIMIT).toEqual({
      limit: 60,
      windowMs: ONE_MINUTE_MS,
    });
  });

  it('uses a tighter limit for free-text reports', () => {
    expect(QUESTION_REPORT_RATE_LIMIT).toEqual({
      limit: 10,
      windowMs: ONE_MINUTE_MS,
    });
  });
});
