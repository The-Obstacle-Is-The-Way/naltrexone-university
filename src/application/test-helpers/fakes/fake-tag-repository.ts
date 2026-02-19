import type { TagRepository } from '@/src/application/ports/repositories';
import type { Tag } from '@/src/domain/entities';

export class FakeTagRepository implements TagRepository {
  private readonly tags: readonly Tag[];

  constructor(tags: readonly Tag[] = []) {
    this.tags = tags;
  }

  async listAll(): Promise<readonly Tag[]> {
    return this.tags;
  }
}
