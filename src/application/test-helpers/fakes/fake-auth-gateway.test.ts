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

  it('answers a current-email refresh with the session user by default', async () => {
    const user = createUser({ id: 'user_1', email: 'auth@example.com' });
    const gateway = new FakeAuthGateway(user);

    await expect(gateway.requireUser({ currentEmail: true })).resolves.toEqual(
      user,
    );
  });

  it('answers a current-email refresh with the configured user, or refuses when there is none', async () => {
    const user = createUser({ id: 'user_1', email: 'stored@example.com' });
    const refreshed = createUser({
      id: 'user_1',
      email: 'current@example.com',
    });

    await expect(
      new FakeAuthGateway(user, { currentEmailUser: refreshed }).requireUser({
        currentEmail: true,
      }),
    ).resolves.toEqual(refreshed);
    await expect(
      new FakeAuthGateway(user, { currentEmailUser: null }).requireUser({
        currentEmail: true,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('records each requireUser call with its options, in order', async () => {
    const gateway = new FakeAuthGateway(createUser({ id: 'user_1' }));

    await gateway.requireUser();
    await gateway.requireUser({ currentEmail: true });

    expect(gateway.requireUserCalls).toEqual([{}, { currentEmail: true }]);
  });
});
