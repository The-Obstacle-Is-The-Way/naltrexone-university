import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { ApplicationError } from '@/src/application/errors';
import { createContainer } from './container';

/**
 * Get the current Clerk user or throw if not authenticated.
 */
export async function getClerkUserOrThrow() {
  const user = await currentUser();
  if (!user) {
    throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
  }
  return user;
}

/**
 * Get the Clerk auth session. Use for checking authentication state.
 */
export async function getAuth() {
  return auth();
}

/**
 * Get the domain user for the current Clerk user.
 * Ensures a `users` row exists (upsert by `clerk_user_id`) via the AuthGateway.
 */
export async function getCurrentUser() {
  const { createAuthGateway } = createContainer();
  return createAuthGateway().requireUser();
}
