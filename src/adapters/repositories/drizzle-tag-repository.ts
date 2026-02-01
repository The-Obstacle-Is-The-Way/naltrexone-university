import { asc } from 'drizzle-orm';
import { tags } from '@/db/schema';
import type { TagRepository } from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly db: DrizzleDb) {}

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
