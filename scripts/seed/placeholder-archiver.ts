import { like } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { assertNoActiveRelease } from '../content-release/release-activation';

export async function archivePlaceholderQuestions(
  db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
  return db.transaction(async (tx) => {
    await assertNoActiveRelease(tx);
    const archived = await tx
      .update(schema.questions)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(like(schema.questions.slug, 'placeholder-%'))
      .returning({ id: schema.questions.id });

    return archived.length;
  });
}
