import { asc, eq } from 'drizzle-orm';
import { questions, questionTags, tags } from '@/db/schema';
import type { TagRepository } from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly db: DrizzleDb) {}

  async listAll() {
    const rows = await this.db
      .selectDistinct({
        id: tags.id,
        slug: tags.slug,
        name: tags.name,
        kind: tags.kind,
      })
      .from(tags)
      .innerJoin(questionTags, eq(questionTags.tagId, tags.id))
      .innerJoin(questions, eq(questions.id, questionTags.questionId))
      .where(eq(questions.status, 'published'))
      .orderBy(asc(tags.kind), asc(tags.slug));

    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      kind: t.kind,
    }));
  }
}
