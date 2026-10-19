import { describe, expectTypeOf, it } from 'vitest';
import type {
  RequestSequencingHooks,
  runLoadQuestionFlow,
  runSubmitAnswerFlow,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { executeIdempotent } from '@/src/adapters/controllers/shared/execute-idempotent';
import type { withIdempotency } from '@/src/adapters/shared/with-idempotency';

describe('request protocol input types', () => {
  it('requires an explicit cache policy on controller actions', () => {
    expectTypeOf<
      Pick<Parameters<typeof executeIdempotent>[0], 'shouldCacheError'>
    >().toEqualTypeOf<{ shouldCacheError: (error: unknown) => boolean }>();
  });

  it('requires an explicit cache policy on the keyed execution wrapper', () => {
    expectTypeOf<
      Pick<Parameters<typeof withIdempotency>[0], 'shouldCacheError'>
    >().toEqualTypeOf<{ shouldCacheError: (error: unknown) => boolean }>();
  });

  it('requires both sequencing hooks for question loads', () => {
    expectTypeOf<
      Pick<
        Parameters<typeof runLoadQuestionFlow>[0],
        keyof RequestSequencingHooks
      >
    >().toEqualTypeOf<RequestSequencingHooks>();
  });

  it('requires both sequencing hooks for answer submissions', () => {
    expectTypeOf<
      Pick<
        Parameters<typeof runSubmitAnswerFlow>[0],
        keyof RequestSequencingHooks
      >
    >().toEqualTypeOf<RequestSequencingHooks>();
  });
});
