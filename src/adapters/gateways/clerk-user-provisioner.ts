import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import { isUserEmailOwnershipConflictError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type { UserRepository } from '@/src/application/ports/repositories';
import type { User } from '@/src/domain/entities';

type ClerkEmailAddressLike = {
  id?: string;
  emailAddress: string;
};

export type ClerkUserLike = {
  id: string;
  primaryEmailAddressId?: string | null;
  emailAddresses: readonly ClerkEmailAddressLike[];
  updatedAt?: unknown;
  updated_at?: unknown;
};

export type ClerkUserIdentity = {
  clerkUserId: string;
  email: string;
  observedAt: Date;
};

export type ClerkUserLookup = (
  clerkUserId: string,
) => Promise<ClerkUserLike | null>;

type EnsureClerkUserDeps = {
  userRepository: UserRepository;
  getClerkUserById: ClerkUserLookup;
  logger: Logger;
};

export function getClerkUserUpdatedAtOrNull(user: ClerkUserLike): Date | null {
  const updatedAt = user.updatedAt ?? user.updated_at;
  if (typeof updatedAt === 'number') return new Date(updatedAt);
  if (updatedAt instanceof Date) return updatedAt;
  return null;
}

export function getClerkUserEmailOrNull(user: ClerkUserLike): string | null {
  if (user.emailAddresses.length === 0) return null;

  const primaryId = user.primaryEmailAddressId;
  if (primaryId) {
    const primary = user.emailAddresses.find((email) => email.id === primaryId);
    if (primary?.emailAddress) return primary.emailAddress;
  }

  return user.emailAddresses[0]?.emailAddress ?? null;
}

function isClerkUserNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  );
}

function conflictLogContext(
  existingClerkUserId: string,
  incomingClerkUserId: string,
  resolution: string,
) {
  return {
    existingClerkUserId,
    incomingClerkUserId,
    resolution,
  };
}

export async function ensureClerkUser(
  deps: EnsureClerkUserDeps,
  identity: ClerkUserIdentity,
): Promise<User> {
  try {
    return await deps.userRepository.upsertByClerkId(
      identity.clerkUserId,
      identity.email,
      { observedAt: identity.observedAt },
    );
  } catch (error) {
    if (!isUserEmailOwnershipConflictError(error)) throw error;

    const existingClerkUserId = error.existingClerkUserId;
    let incomingUser: User | null;
    try {
      incomingUser = await deps.userRepository.findByClerkId(
        identity.clerkUserId,
      );
    } catch (lookupError) {
      deps.logger.warn(
        conflictLogContext(
          existingClerkUserId,
          identity.clerkUserId,
          'blocked_incoming_identity_lookup_failed',
        ),
        'Blocked Clerk user email ownership conflict',
      );
      throw lookupError;
    }
    if (incomingUser) {
      deps.logger.warn(
        conflictLogContext(
          existingClerkUserId,
          identity.clerkUserId,
          'blocked_incoming_identity_already_exists',
        ),
        'Blocked Clerk user email ownership conflict',
      );
      throw error;
    }

    let existingClerkUser: ClerkUserLike | null;

    try {
      existingClerkUser = await retry(
        () => deps.getClerkUserById(existingClerkUserId),
        {
          ...DEFAULT_RETRY_OPTIONS,
          shouldRetry: isTransientExternalError,
        },
      );
    } catch (lookupError) {
      if (isClerkUserNotFoundError(lookupError)) {
        existingClerkUser = null;
      } else {
        deps.logger.warn(
          conflictLogContext(
            existingClerkUserId,
            identity.clerkUserId,
            'blocked_existing_identity_lookup_failed',
          ),
          'Blocked Clerk user email ownership conflict',
        );
        throw lookupError;
      }
    }

    if (!existingClerkUser) {
      deps.logger.warn(
        conflictLogContext(
          existingClerkUserId,
          identity.clerkUserId,
          'blocked_existing_identity_missing',
        ),
        'Blocked Clerk user email ownership conflict',
      );
      throw error;
    }

    const existingEmail = getClerkUserEmailOrNull(existingClerkUser);
    const existingObservedAt = getClerkUserUpdatedAtOrNull(existingClerkUser);
    if (
      existingClerkUser.id !== existingClerkUserId ||
      !existingEmail ||
      !existingObservedAt ||
      existingEmail === identity.email
    ) {
      deps.logger.warn(
        conflictLogContext(
          existingClerkUserId,
          identity.clerkUserId,
          existingEmail === identity.email
            ? 'blocked_existing_identity_still_owns_email'
            : 'blocked_existing_identity_unverifiable',
        ),
        'Blocked Clerk user email ownership conflict',
      );
      throw error;
    }

    try {
      const synchronized = await deps.userRepository.updateEmailByClerkId(
        existingClerkUserId,
        existingEmail,
        { observedAt: existingObservedAt },
      );
      if (!synchronized || synchronized.email !== existingEmail) {
        deps.logger.warn(
          conflictLogContext(
            existingClerkUserId,
            identity.clerkUserId,
            'blocked_existing_identity_email_not_synchronized',
          ),
          'Blocked Clerk user email ownership conflict',
        );
        throw error;
      }

      const incoming = await deps.userRepository.upsertByClerkId(
        identity.clerkUserId,
        identity.email,
        { observedAt: identity.observedAt },
      );
      deps.logger.info(
        conflictLogContext(
          existingClerkUserId,
          identity.clerkUserId,
          'existing_identity_email_synchronized',
        ),
        'Resolved Clerk user email ownership conflict',
      );
      return incoming;
    } catch (resolutionError) {
      if (resolutionError === error) throw resolutionError;

      deps.logger.warn(
        conflictLogContext(
          existingClerkUserId,
          identity.clerkUserId,
          'blocked_identity_resolution_failed',
        ),
        'Blocked Clerk user email ownership conflict',
      );
      throw resolutionError;
    }
  }
}
