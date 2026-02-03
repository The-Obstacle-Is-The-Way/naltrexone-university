import { describe, expect, it } from 'vitest';
import { loadJsonFixture } from './load-json-fixture';

describe('loadJsonFixture', () => {
  it('loads a JSON fixture by relative path', () => {
    const event = loadJsonFixture('stripe/customer.subscription.updated.json');

    expect(event).toMatchObject({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_123' } },
    });
  });
});
