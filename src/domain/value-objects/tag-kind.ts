/**
 * Tag categorization types.
 */
export const AllTagKinds = [
  'domain', // exam blueprint area
  'topic', // clinical topic
  'substance', // alcohol/opioids/etc
  'treatment', // meds/psychosocial
  'diagnosis', // DSM/ICD category
] as const;

export type TagKind = (typeof AllTagKinds)[number];
