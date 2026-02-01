import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { UserRepository } from '@/src/application/ports/repositories';
import type { User } from '@/src/domain/entities';

type ClerkEmailAddressLike = {
  id?: string;
  emailAddress: string;
};

type ClerkUserLike = {
  id: string;
  primaryEmailAddressId?: string | null;
  emailAddresses: readonly ClerkEmailAddressLike[];
};

export type ClerkAuthGatewayDeps = {
  userRepository: UserRepository;
  getClerkUser: () => Promise<ClerkUserLike | null>;
};

export class ClerkAuthGateway implements AuthGateway {
  constructor(private readonly deps: ClerkAuthGatewayDeps) {}

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
    const clerkUser = await this.deps.getClerkUser();
    if (!clerkUser) return null;

    const email = this.getEmailOrNull(clerkUser);
    if (!email) {
      throw new ApplicationError('INTERNAL_ERROR', 'User has no email address');
    }

    return this.deps.userRepository.upsertByClerkId(clerkUser.id, email);
  }

  async requireUser(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
    }
    return user;
  }
}
