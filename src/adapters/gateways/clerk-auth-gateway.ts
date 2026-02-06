import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
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

export type ClerkAuthGatewayDeps = {
  userRepository: UserRepository;
  getClerkUser: () => Promise<ClerkUserLike | null>;
};

export class ClerkAuthGateway implements AuthGateway {
  constructor(private readonly deps: ClerkAuthGatewayDeps) {}

  private getUpdatedAtOrNull(user: ClerkUserLike): Date | null {
    const updatedAt = user.updatedAt ?? user.updated_at;
    if (typeof updatedAt === 'number') return new Date(updatedAt);
    if (updatedAt instanceof Date) return updatedAt;
    return null;
  }

  private getEmailOrNull(user: ClerkUserLike): string | null {
    if (user.emailAddresses.length === 0) return null;

    const primaryId = user.primaryEmailAddressId;
    if (primaryId) {
      const primary = user.emailAddresses.find((e) => e.id === primaryId);
      if (primary?.emailAddress) return primary.emailAddress;
    }

    return user.emailAddresses[0]?.emailAddress ?? null;
  }

  async getCurrentUser(): Promise<User | null> {
    const clerkUser = await retry(() => this.deps.getClerkUser(), {
      maxAttempts: 3,
      initialDelayMs: 100,
      factor: 2,
      maxDelayMs: 1000,
      shouldRetry: isTransientExternalError,
    });
    if (!clerkUser) return null;

    const email = this.getEmailOrNull(clerkUser);
    if (!email) {
      throw new ApplicationError('INTERNAL_ERROR', 'User has no email address');
    }

    const observedAt = this.getUpdatedAtOrNull(clerkUser);
    if (!observedAt) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Clerk user updatedAt is required',
      );
    }

    return this.deps.userRepository.upsertByClerkId(clerkUser.id, email, {
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
