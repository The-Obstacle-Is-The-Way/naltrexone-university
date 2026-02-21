import type {
  UpsertUserByClerkIdOptions,
  UserRepository,
} from '@/src/application/ports/repositories';
import type { User } from '@/src/domain/entities';

type StoredUser = { user: User; clerkId: string };

export class FakeUserRepository implements UserRepository {
  private readonly byClerkId = new Map<string, StoredUser>();
  private readonly byEmail = new Map<string, string>();
  private nextId = 1;
  private lastObservedAtMs: number | null = null;

  async findByClerkId(clerkId: string): Promise<User | null> {
    const stored = this.byClerkId.get(clerkId);
    return stored?.user ?? null;
  }

  async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User> {
    const observedAt =
      options?.observedAt ??
      (() => {
        const nowMs = Date.now();
        const observedAtMs =
          this.lastObservedAtMs === null
            ? nowMs
            : Math.max(nowMs, this.lastObservedAtMs + 1);
        this.lastObservedAtMs = observedAtMs;
        return new Date(observedAtMs);
      })();

    this.lastObservedAtMs = Math.max(
      this.lastObservedAtMs ?? 0,
      observedAt.getTime(),
    );

    const existingClerkIdForEmail = this.byEmail.get(email);
    if (existingClerkIdForEmail && existingClerkIdForEmail !== clerkId) {
      const existingByEmail = this.byClerkId.get(existingClerkIdForEmail);
      if (existingByEmail) {
        if (existingByEmail.user.updatedAt >= observedAt) {
          return existingByEmail.user;
        }

        const migratedUser: User = {
          ...existingByEmail.user,
          updatedAt: observedAt,
        };
        this.byClerkId.delete(existingClerkIdForEmail);
        this.byClerkId.set(clerkId, { user: migratedUser, clerkId });
        this.byEmail.set(email, clerkId);
        return migratedUser;
      }

      this.byEmail.delete(email);
    }

    const existing = this.byClerkId.get(clerkId);

    if (existing) {
      if (existing.user.email === email) {
        return existing.user;
      }

      if (existing.user.updatedAt >= observedAt) {
        return existing.user;
      }
      const updatedUser: User = {
        ...existing.user,
        email,
        updatedAt: observedAt,
      };
      if (existing.user.email !== email) {
        this.byEmail.delete(existing.user.email);
        this.byEmail.set(email, clerkId);
      }
      this.byClerkId.set(clerkId, { user: updatedUser, clerkId });
      return updatedUser;
    }

    const now = observedAt;
    const newUser: User = {
      id: `user-${this.nextId++}`,
      email,
      createdAt: now,
      updatedAt: now,
    };
    this.byClerkId.set(clerkId, { user: newUser, clerkId });
    this.byEmail.set(email, clerkId);
    return newUser;
  }

  async deleteByClerkId(clerkId: string): Promise<boolean> {
    const stored = this.byClerkId.get(clerkId);
    if (!stored) return false;

    this.byClerkId.delete(clerkId);
    if (this.byEmail.get(stored.user.email) === clerkId) {
      this.byEmail.delete(stored.user.email);
    }

    return true;
  }
}
