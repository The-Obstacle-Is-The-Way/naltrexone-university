import { describe, expect, it } from 'vitest';
import {
  DrizzleQuestionFeedbackRepository,
  DrizzleUserRepository,
} from '@/src/adapters/repositories';

describe('repositories exports', () => {
  it('exports repositories from the barrel', () => {
    expect(DrizzleQuestionFeedbackRepository).toBeTypeOf('function');
    expect(DrizzleUserRepository).toBeTypeOf('function');
  });
});
