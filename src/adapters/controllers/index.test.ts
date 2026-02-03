import { describe, expect, it } from 'vitest';
import {
  createCheckoutSession,
  getNextQuestion,
  getQuestionBySlug,
  getTags,
  getUserStats,
  processStripeWebhook,
  submitAnswer,
  toggleBookmark,
} from '@/src/adapters/controllers';

describe('controllers exports', () => {
  it('exports controller functions from the barrel', () => {
    expect(createCheckoutSession).toBeTypeOf('function');
    expect(getNextQuestion).toBeTypeOf('function');
    expect(getQuestionBySlug).toBeTypeOf('function');
    expect(submitAnswer).toBeTypeOf('function');
    expect(toggleBookmark).toBeTypeOf('function');
    expect(getUserStats).toBeTypeOf('function');
    expect(processStripeWebhook).toBeTypeOf('function');
    expect(getTags).toBeTypeOf('function');
  });
});
