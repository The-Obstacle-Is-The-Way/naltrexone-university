import type { TagKind } from '../value-objects';

/**
 * Tag entity - categorization label.
 */
export type Tag = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: TagKind;
};
