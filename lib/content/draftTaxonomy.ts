export const DRAFT_SUBSTANCE_SLUGS = [
  'alcohol',
  'opioids',
  'stimulants',
  'cannabis',
  'tobacco',
  'sedatives',
  'hallucinogens',
  'caffeine',
  'inhalants',
  'polysubstance',
  'other',
] as const;

export type DraftSubstanceSlug = (typeof DRAFT_SUBSTANCE_SLUGS)[number];

export const DRAFT_TOPIC_SLUGS = [
  'pharmacology',
  'neurobiology',
  'diagnosis',
  'treatment',
  'withdrawal',
  'intoxication',
  'screening',
  'epidemiology',
  'special-populations',
  'comorbidity',
  'psychotherapy',
  'harm-reduction',
  'toxicology',
  'ethics-legal',
  'medical-complications',
] as const;

export type DraftTopicSlug = (typeof DRAFT_TOPIC_SLUGS)[number];
