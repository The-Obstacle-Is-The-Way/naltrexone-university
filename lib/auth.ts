import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { db } from './db';

/**
 * Get the current Clerk user or throw if not authenticated.
 */
export async function getClerkUserOrThrow() {
  const user = await currentUser();
  if (!user) {
    throw new Error('UNAUTHENTICATED');
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
 * Ensure a user row exists in our database for the given Clerk user.
 * Creates the row if it doesn't exist, returns the existing row if it does.
 */
export async function ensureUserRow(clerkUserId: string, email: string) {
  // Try to find existing user
  const existingUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });

  if (existingUser) {
    return existingUser;
  }

  // Create new user
  const [newUser] = await db
    .insert(users)
    .values({
      clerkUserId,
      email,
    })
    .returning();

  return newUser;
}

/**
 * Get the database user row for the current Clerk user.
 * Creates the row if it doesn't exist.
 */
export async function getCurrentUser() {
  const clerkUser = await getClerkUserOrThrow();
  const email = clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error('User has no email address');
  }

  return ensureUserRow(clerkUser.id, email);
}
