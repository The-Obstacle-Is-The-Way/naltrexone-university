import type { DeletedClerkUserRepository } from '@/src/application/ports/repositories';

type DeletedClerkUserSnapshot = ReadonlyArray<readonly [string, Date]>;

export class FakeDeletedClerkUserRepository
  implements DeletedClerkUserRepository
{
  private readonly deletedUsers = new Map<string, Date>();

  async lock(_clerkUserId: string): Promise<void> {}

  async exists(clerkUserId: string): Promise<boolean> {
    return this.deletedUsers.has(clerkUserId);
  }

  async markDeleted(
    clerkUserId: string,
    deletedAt = new Date(),
  ): Promise<void> {
    if (!this.deletedUsers.has(clerkUserId)) {
      this.deletedUsers.set(clerkUserId, deletedAt);
    }
  }

  snapshot(): DeletedClerkUserSnapshot {
    return [...this.deletedUsers.entries()].map(([clerkUserId, deletedAt]) => [
      clerkUserId,
      new Date(deletedAt),
    ]);
  }

  restore(snapshot: DeletedClerkUserSnapshot): void {
    this.deletedUsers.clear();
    for (const [clerkUserId, deletedAt] of snapshot) {
      this.deletedUsers.set(clerkUserId, new Date(deletedAt));
    }
  }
}
