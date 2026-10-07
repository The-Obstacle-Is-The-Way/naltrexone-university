import {
  FakeDeletedClerkUserRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import { runSessionIdentityContract } from '@/tests/shared/session-identity-contract';

// The maintained fakes' side of the shared session-identity contract; the
// Postgres side is tests/integration/session-identity-contract.integration.test.ts.
runSessionIdentityContract('fake repositories', async () => ({
  userRepository: new FakeUserRepository(),
  deletedClerkUsers: new FakeDeletedClerkUserRepository(),
  clerkUserId: `clerk_${crypto.randomUUID()}`,
  track: () => {},
}));
