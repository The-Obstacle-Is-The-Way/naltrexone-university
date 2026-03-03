import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeAuthGateway } from './fake-gateways';

describe('FakeAuthGateway', () => {
  it('returns null from getCurrentUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.getCurrentUser()).resolves.toBeNull();
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.requireUser()).rejects.toEqual(
      new ApplicationError('UNAUTHENTICATED', 'User not authenticated'),
    );
  });
});
