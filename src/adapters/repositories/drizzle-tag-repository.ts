import { asc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { tags } from '@/db/schema';
import type { TagRepository } from '@/src/application/ports/repositories';

type Db = PostgresJsDatabase<typeof schema>;

export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly db: Db) {}

  async listAll() {
    const rows = await this.db.query.tags.findMany({
      orderBy: [asc(tags.kind), asc(tags.slug)],
    });

    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      kind: t.kind,
    }));
  }
}
