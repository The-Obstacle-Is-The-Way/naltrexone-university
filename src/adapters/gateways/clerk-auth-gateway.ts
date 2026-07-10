import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type { UserRepository } from '@/src/application/ports/repositories';
import type { User } from '@/src/domain/entities';
import {
  type ClerkUserLike,
  type ClerkUserLookup,
  ensureClerkUser,
  getClerkUserEmailOrNull,
  getClerkUserUpdatedAtOrNull,
} from './clerk-user-provisioner';

export type { ClerkUserLike, ClerkUserLookup } from './clerk-user-provisioner';

export type ClerkAuthGatewayDeps = {
  userRepository: UserRepository;
  getClerkUser: () => Promise<ClerkUserLike | null>;
  getClerkUserById: ClerkUserLookup;
  logger: Logger;
};

export class ClerkAuthGateway implements AuthGateway {
  constructor(private readonly deps: ClerkAuthGatewayDeps) {}

  async getCurrentUser(): Promise<User | null> {
    const clerkUser = await retry(() => this.deps.getClerkUser(), {
      ...DEFAULT_RETRY_OPTIONS,
      shouldRetry: isTransientExternalError,
    });
    if (!clerkUser) return null;

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

    return ensureClerkUser(this.deps, {
      clerkUserId: clerkUser.id,
      email,
      observedAt,
    });
  }

  async requireUser(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
    }
    return user;
  }
}
