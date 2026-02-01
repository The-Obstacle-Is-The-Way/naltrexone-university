import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';

/**
 * Shared Drizzle database type for all repository and gateway implementations.
 * Centralizes the database type definition to avoid duplication (DRY).
 */
export type DrizzleDb = PostgresJsDatabase<typeof schema>;
