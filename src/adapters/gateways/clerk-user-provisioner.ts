import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import {
  isUserEmailOwnershipConflictError,
  type UserEmailOwnershipConflictError,
} from '@/src/application/errors';
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

export type ClerkUserEmailOwnershipResolution = Readonly<{
  existingClerkUserId: string;
  existingEmail: string;
  existingObservedAt: Date;
}>;

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

export function clerkIdentityConflictLogContext(
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

export async function validateClerkUserEmailOwnershipConflict(
  deps: Pick<EnsureClerkUserDeps, 'userRepository' | 'logger'>,
  identity: ClerkUserIdentity,
  conflict: UserEmailOwnershipConflictError,
): Promise<void> {
  let incomingUser: User | null;

  try {
    incomingUser = await deps.userRepository.findByClerkId(
      identity.clerkUserId,
    );
  } catch (lookupError) {
    deps.logger.warn(
      clerkIdentityConflictLogContext(
        conflict.existingClerkUserId,
        identity.clerkUserId,
        'blocked_incoming_identity_lookup_failed',
      ),
      'Blocked Clerk user email ownership conflict',
    );
    throw lookupError;
  }

  if (incomingUser) {
    deps.logger.warn(
      clerkIdentityConflictLogContext(
        conflict.existingClerkUserId,
        identity.clerkUserId,
        'blocked_incoming_identity_already_exists',
      ),
      'Blocked Clerk user email ownership conflict',
    );
    throw conflict;
  }
}

export async function resolveClerkUserEmailOwnershipConflict(
  deps: Pick<EnsureClerkUserDeps, 'getClerkUserById' | 'logger'>,
  identity: ClerkUserIdentity,
  conflict: UserEmailOwnershipConflictError,
): Promise<ClerkUserEmailOwnershipResolution> {
  const existingClerkUserId = conflict.existingClerkUserId;
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
        clerkIdentityConflictLogContext(
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
      clerkIdentityConflictLogContext(
        existingClerkUserId,
        identity.clerkUserId,
        'blocked_existing_identity_missing',
      ),
      'Blocked Clerk user email ownership conflict',
    );
    throw conflict;
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
      clerkIdentityConflictLogContext(
        existingClerkUserId,
        identity.clerkUserId,
        existingEmail === identity.email
          ? 'blocked_existing_identity_still_owns_email'
          : 'blocked_existing_identity_unverifiable',
      ),
      'Blocked Clerk user email ownership conflict',
    );
    throw conflict;
  }

  return {
    existingClerkUserId,
    existingEmail,
    existingObservedAt,
  };
}

export async function applyClerkUserEmailOwnershipResolution(
  deps: Pick<EnsureClerkUserDeps, 'userRepository' | 'logger'>,
  identity: ClerkUserIdentity,
  originalConflict: UserEmailOwnershipConflictError,
  resolution: ClerkUserEmailOwnershipResolution,
): Promise<User> {
  // External lookup can outlive the local ownership snapshot. Recheck every
  // mutable precondition before applying the resolved Clerk state.
  await validateClerkUserEmailOwnershipConflict(
    deps,
    identity,
    originalConflict,
  );

  let currentConflict: UserEmailOwnershipConflictError;

  try {
    const incoming = await deps.userRepository.upsertByClerkId(
      identity.clerkUserId,
      identity.email,
      { observedAt: identity.observedAt },
    );
    deps.logger.info(
      clerkIdentityConflictLogContext(
        resolution.existingClerkUserId,
        identity.clerkUserId,
        'identity_conflict_already_resolved',
      ),
      'Resolved Clerk user email ownership conflict',
    );
    return incoming;
  } catch (error) {
    if (!isUserEmailOwnershipConflictError(error)) throw error;
    currentConflict = error;
  }

  await validateClerkUserEmailOwnershipConflict(
    deps,
    identity,
    currentConflict,
  );

  if (currentConflict.existingClerkUserId !== resolution.existingClerkUserId) {
    deps.logger.warn(
      clerkIdentityConflictLogContext(
        currentConflict.existingClerkUserId,
        identity.clerkUserId,
        'blocked_identity_resolution_stale',
      ),
      'Blocked Clerk user email ownership conflict',
    );
    throw currentConflict;
  }

  try {
    const synchronized = await deps.userRepository.updateEmailByClerkId(
      resolution.existingClerkUserId,
      resolution.existingEmail,
      { observedAt: resolution.existingObservedAt },
    );
    if (!synchronized || synchronized.email !== resolution.existingEmail) {
      deps.logger.warn(
        clerkIdentityConflictLogContext(
          resolution.existingClerkUserId,
          identity.clerkUserId,
          'blocked_existing_identity_email_not_synchronized',
        ),
        'Blocked Clerk user email ownership conflict',
      );
      throw currentConflict;
    }

    const incoming = await deps.userRepository.upsertByClerkId(
      identity.clerkUserId,
      identity.email,
      { observedAt: identity.observedAt },
    );
    deps.logger.info(
      clerkIdentityConflictLogContext(
        resolution.existingClerkUserId,
        identity.clerkUserId,
        'existing_identity_email_synchronized',
      ),
      'Resolved Clerk user email ownership conflict',
    );
    return incoming;
  } catch (resolutionError) {
    if (resolutionError === currentConflict) throw resolutionError;

    deps.logger.warn(
      clerkIdentityConflictLogContext(
        resolution.existingClerkUserId,
        identity.clerkUserId,
        'blocked_identity_resolution_failed',
      ),
      'Blocked Clerk user email ownership conflict',
    );
    throw resolutionError;
  }
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

    await validateClerkUserEmailOwnershipConflict(deps, identity, error);
    const resolution = await resolveClerkUserEmailOwnershipConflict(
      deps,
      identity,
      error,
    );
    return applyClerkUserEmailOwnershipResolution(
      deps,
      identity,
      error,
      resolution,
    );
  }
}
