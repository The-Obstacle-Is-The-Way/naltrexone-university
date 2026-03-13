export interface DeletedClerkUserRepository {
  exists(clerkUserId: string): Promise<boolean>;
  markDeleted(clerkUserId: string, deletedAt?: Date): Promise<void>;
}
