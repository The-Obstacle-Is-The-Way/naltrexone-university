import { describe, expectTypeOf, it } from 'vitest';
import type { withIdempotency } from './with-idempotency';

describe('withIdempotency inputs', () => {
  it('requires an explicit cache policy on the keyed execution wrapper', () => {
    expectTypeOf<
      Pick<Parameters<typeof withIdempotency>[0], 'shouldCacheError'>
    >().toEqualTypeOf<{ shouldCacheError: (error: unknown) => boolean }>();
  });
});
