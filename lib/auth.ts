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
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });

  if (existing) {
    if (existing.email === email) {
      return existing;
    }

    const [updated] = await db
      .update(users)
      .set({
        email,
        updatedAt: new Date(),
      })
      .where(eq(users.clerkUserId, clerkUserId))
      .returning();

    return updated ?? existing;
  }

  const [inserted] = await db
    .insert(users)
    .values({ clerkUserId, email })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();

  if (inserted) {
    return inserted;
  }

  // Another concurrent request may have created the row. Fetch and reconcile email if needed.
  const after = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });

  if (!after) {
    throw new Error('Failed to ensure user row');
  }

  if (after.email === email) {
    return after;
  }

  const [updated] = await db
    .update(users)
    .set({
      email,
      updatedAt: new Date(),
    })
    .where(eq(users.clerkUserId, clerkUserId))
    .returning();

  return updated ?? after;
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
