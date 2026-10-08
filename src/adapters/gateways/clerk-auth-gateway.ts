import { getPostgresErrorCode } from '@/src/adapters/repositories/postgres-errors';
import { retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RequireUserOptions,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  DeletedClerkUserRepository,
  UserRepository,
} from '@/src/application/ports/repositories';
import type { User } from '@/src/domain/entities';
import { isTransientClerkError } from './clerk-retry';
import {
  type ClerkUserLookup,
  ensureClerkUser,
  getClerkUserEmailOrNull,
  getClerkUserUpdatedAtOrNull,
  isClerkUserNotFoundError,
} from './clerk-user-provisioner';

export type { ClerkUserLike, ClerkUserLookup } from './clerk-user-provisioner';

const POSTGRES_DEADLOCK_DETECTED = '40P01';

function isPostgresDeadlock(error: unknown): boolean {
  return getPostgresErrorCode(error) === POSTGRES_DEADLOCK_DETECTED;
}

export type ClerkAuthGatewayDeps = {
  userRepository: UserRepository;
  deletedClerkUsers: Pick<DeletedClerkUserRepository, 'exists'>;
  /** The Clerk user ID of the session the middleware verified, or null. */
  getSessionClerkUserId: () => Promise<string | null>;
  getClerkUserById: ClerkUserLookup;
  logger: Logger;
};

// DEBT-503 item 1: a signed-in request reads the Clerk user ID from the
// verified session, then our own row and the deletion tombstone. Clerk's
// Backend API, a shared and rate-limited allowance, is asked only to
// provision a missing row or to refresh the email billing sends to Stripe.
// Both go through ensureClerkUser unchanged, so BUG-284's identity rules, and
// its stale-owner lookup, and BUG-320's retry hold.
export class ClerkAuthGateway implements AuthGateway {
  constructor(private readonly deps: ClerkAuthGatewayDeps) {}

  async getCurrentUser(): Promise<User | null> {
    const clerkUserId = await this.deps.getSessionClerkUserId();
    if (!clerkUserId) return null;

    const [row, deleted] = await Promise.all([
      this.deps.userRepository.findByClerkId(clerkUserId),
      this.deps.deletedClerkUsers.exists(clerkUserId),
    ]);
    // Clerk's 404 used to be the only sign-in guard against a deleted user's
    // leftover row; the tombstone is that guard now.
    if (deleted) {
      this.deps.logger.warn({ clerkUserId }, 'clerk_session_for_deleted_user');
      return null;
    }
    if (row) return row;

    return this.provisionFromClerk(clerkUserId);
  }

  async requireUser(options: RequireUserOptions = {}): Promise<User> {
    const user = options.currentEmail
      ? await this.refreshFromClerk()
      : await this.getCurrentUser();
    if (!user) {
      throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
    }
    return user;
  }

  private async refreshFromClerk(): Promise<User | null> {
    const clerkUserId = await this.deps.getSessionClerkUserId();
    if (!clerkUserId) return null;
    if (await this.deps.deletedClerkUsers.exists(clerkUserId)) {
      this.deps.logger.warn({ clerkUserId }, 'clerk_session_for_deleted_user');
      return null;
    }
    return this.provisionFromClerk(clerkUserId);
  }

  private async provisionFromClerk(clerkUserId: string): Promise<User | null> {
    const clerkUser = await this.lookUpSessionUser(clerkUserId);
    if (!clerkUser) {
      this.deps.logger.warn({ clerkUserId }, 'clerk_session_user_not_found');
      return null;
    }
    if (clerkUser.id !== clerkUserId) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Clerk returned a different user than the session',
      );
    }

    const email = getClerkUserEmailOrNull(clerkUser);
    if (!email) {
      throw new ApplicationError('INTERNAL_ERROR', 'User has no email address');
    }

    const observedAt = getClerkUserUpdatedAtOrNull(clerkUser);
    if (!observedAt) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Clerk user updatedAt is required',
      );
    }

    // BUG-332: a new user's concurrent first requests can deadlock in the
    // upsert, and Postgres aborts one as the victim. Provisioning runs outside
    // any caller transaction, so the whole step can be retried; Clerk is not
    // asked again.
    return retry(
      () => ensureClerkUser(this.deps, { clerkUserId, email, observedAt }),
      { ...DEFAULT_RETRY_OPTIONS, shouldRetry: isPostgresDeadlock },
    );
  }

  // The Backend API answers 404 for a user Clerk no longer has, whose token
  // can stay valid for about a minute after the deletion.
  private async lookUpSessionUser(clerkUserId: string) {
    try {
      return await retry(() => this.deps.getClerkUserById(clerkUserId), {
        ...DEFAULT_RETRY_OPTIONS,
        shouldRetry: isTransientClerkError,
      });
    } catch (error) {
      if (isClerkUserNotFoundError(error)) return null;
      throw error;
    }
  }
}
