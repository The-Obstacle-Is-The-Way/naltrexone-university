import type { Tag } from '@/src/domain/entities';

export interface TagRepository {
  listAll(): Promise<readonly Tag[]>;
}
