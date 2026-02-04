import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { User } from '@/src/domain/entities';

export class SkipAuthGateway implements AuthGateway {
  async getCurrentUser(): Promise<User | null> {
    return null;
  }

  async requireUser(): Promise<User> {
    throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
  }
}
