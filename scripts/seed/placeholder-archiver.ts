import { like } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';

export async function archivePlaceholderQuestions(
  db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
  const archived = await db
    .update(schema.questions)
    .set({
      status: 'archived',
      updatedAt: new Date(),
    })
    .where(like(schema.questions.slug, 'placeholder-%'))
    .returning({ id: schema.questions.id });

  return archived.length;
}
