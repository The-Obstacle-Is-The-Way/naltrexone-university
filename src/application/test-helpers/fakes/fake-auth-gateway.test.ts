import { describe, expect, it } from 'vitest';
import { createUser } from '@/src/domain/test-helpers/factories';
import { FakeAuthGateway } from './fake-gateways';

describe('FakeAuthGateway', () => {
  it('returns null from getCurrentUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.getCurrentUser()).resolves.toBeNull();
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('returns user from getCurrentUser when authenticated', async () => {
    const user = createUser({ id: 'user_1', email: 'auth@example.com' });
    const gateway = new FakeAuthGateway(user);

    await expect(gateway.getCurrentUser()).resolves.toEqual(user);
  });

  it('returns user from requireUser when authenticated', async () => {
    const user = createUser({ id: 'user_1', email: 'auth@example.com' });
    const gateway = new FakeAuthGateway(user);

    await expect(gateway.requireUser()).resolves.toEqual(user);
  });
});
