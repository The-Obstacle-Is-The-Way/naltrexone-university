import { describe, expect, it } from 'vitest';
import {
  createCheckoutSession,
  getNextQuestion,
  getQuestionBySlug,
  getQuestionRating,
  getTags,
  getUserStats,
  processStripeWebhook,
  rateQuestion,
  setBookmark,
  submitAnswer,
  submitQuestionReport,
} from '@/src/adapters/controllers';

describe('controllers exports', () => {
  it('exports controller functions from the barrel', () => {
    expect(createCheckoutSession).toBeTypeOf('function');
    expect(getNextQuestion).toBeTypeOf('function');
    expect(getQuestionBySlug).toBeTypeOf('function');
    expect(getQuestionRating).toBeTypeOf('function');
    expect(submitAnswer).toBeTypeOf('function');
    expect(rateQuestion).toBeTypeOf('function');
    expect(submitQuestionReport).toBeTypeOf('function');
    expect(setBookmark).toBeTypeOf('function');
    expect(getUserStats).toBeTypeOf('function');
    expect(processStripeWebhook).toBeTypeOf('function');
    expect(getTags).toBeTypeOf('function');
  });
});
