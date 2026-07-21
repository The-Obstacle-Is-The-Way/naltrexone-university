import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('transaction-bound lock wiring', () => {
  it('constructs Clerk and Stripe lock-capable repositories from webhook callback transactions', () => {
    const clerkRoute = readSource('app/api/webhooks/clerk/route.ts');
    const controllerFactories = readSource('lib/container/controllers.ts');

    expect(clerkRoute).toMatch(
      /container\.db\.transaction\(async \(tx\) =>\s*fn\(\{/,
    );
    for (const factory of [
      'createClerkEventRepository',
      'createDeletedClerkUserRepository',
      'createUserRepository',
    ]) {
      expect(clerkRoute).toContain(`container.${factory}(tx)`);
    }

    expect(controllerFactories).toMatch(
      /primitives\.db\.transaction\(async \(tx\) =>\s*fn\(\{/,
    );
    for (const factory of [
      'createStripeEventRepository',
      'createSubscriptionRepository',
    ]) {
      expect(controllerFactories).toContain(`repositories.${factory}(tx)`);
    }
  });

  it('pins subscription upsert and user deletion to the shared subscription lock key', () => {
    const subscriptionRepository = readSource(
      'src/adapters/repositories/drizzle-subscription-repository.ts',
    );
    const userRepository = readSource(
      'src/adapters/repositories/drizzle-user-repository.ts',
    );
    const clerkController = readSource(
      'src/adapters/controllers/clerk-webhook-controller.ts',
    );
    const subscriptionLock = readSource(
      'src/adapters/repositories/subscription-write-lock.ts',
    );
    const deletedClerkUsers = readSource(
      'src/adapters/repositories/drizzle-deleted-clerk-user-repository.ts',
    );

    expect(subscriptionRepository).toContain(
      'await acquireSubscriptionWriteLock(tx, input.userId)',
    );
    expect(userRepository).toContain(
      'await acquireSubscriptionWriteLock(this.db, userId)',
    );
    expect(clerkController).toContain(
      'await userRepository.acquireSubscriptionWriteLock(',
    );
    expect(subscriptionLock).toContain(
      `pg_advisory_xact_lock(hashtext(\${userId}))`,
    );
    expect(deletedClerkUsers).toContain(
      `pg_advisory_xact_lock(hashtextextended(\${clerkUserId}, 0))`,
    );
  });
});
