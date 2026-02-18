export const CANONICAL_TOPIC_SLUGS = [
  'screening-diagnosis',
  'epidemiology-prevention',
  'pharmacology-neuroscience',
  'intoxication-toxicology',
  'withdrawal-management',
  'treatment-pharmacotherapy',
  'psychosocial-interventions',
  'co-occurring-disorders',
  'medical-complications',
  'harm-reduction',
  'ethics-legal',
  'special-populations',
  'general',
] as const;

export type CanonicalTopicSlug = (typeof CANONICAL_TOPIC_SLUGS)[number];

export const CANONICAL_TOPIC_DISPLAY_NAMES: Record<CanonicalTopicSlug, string> =
  {
    'screening-diagnosis': 'Screening & Diagnosis',
    'epidemiology-prevention': 'Epidemiology & Prevention',
    'pharmacology-neuroscience': 'Pharmacology & Neuroscience',
    'intoxication-toxicology': 'Intoxication & Toxicology',
    'withdrawal-management': 'Withdrawal Management',
    'treatment-pharmacotherapy': 'Treatment & Pharmacotherapy',
    'psychosocial-interventions': 'Psychosocial Interventions',
    'co-occurring-disorders': 'Co-occurring Disorders',
    'medical-complications': 'Medical Complications',
    'harm-reduction': 'Harm Reduction',
    'ethics-legal': 'Ethics & Legal',
    'special-populations': 'Special Populations',
    general: 'General',
  };

export const CANONICAL_SUBSTANCE_SLUGS = [
  'alcohol',
  'cannabis',
  'cocaine',
  'hallucinogens',
  'inhalants',
  'opioids',
  'polysubstance',
  'sedatives',
  'stimulants',
  'tobacco',
  'other',
] as const;

export type CanonicalSubstanceSlug = (typeof CANONICAL_SUBSTANCE_SLUGS)[number];

export const CANONICAL_SUBSTANCE_DISPLAY_NAMES: Record<
  CanonicalSubstanceSlug,
  string
> = {
  alcohol: 'Alcohol',
  cannabis: 'Cannabis',
  cocaine: 'Cocaine',
  hallucinogens: 'Hallucinogens',
  inhalants: 'Inhalants',
  opioids: 'Opioids',
  polysubstance: 'Polysubstance',
  sedatives: 'Sedatives',
  stimulants: 'Stimulants',
  tobacco: 'Tobacco',
  other: 'Other',
};

export const CANONICAL_TREATMENT_SLUGS = [
  'acamprosate',
  'buprenorphine',
  'bupropion',
  'disulfiram',
  'gabapentin',
  'methadone',
  'naloxone',
  'naltrexone',
  'nrt',
  'topiramate',
  'varenicline',
  'other-treatment',
] as const;

export type CanonicalTreatmentSlug = (typeof CANONICAL_TREATMENT_SLUGS)[number];

export const CANONICAL_TREATMENT_DISPLAY_NAMES: Record<
  CanonicalTreatmentSlug,
  string
> = {
  acamprosate: 'Acamprosate',
  buprenorphine: 'Buprenorphine',
  bupropion: 'Bupropion',
  disulfiram: 'Disulfiram',
  gabapentin: 'Gabapentin',
  methadone: 'Methadone',
  naloxone: 'Naloxone',
  naltrexone: 'Naltrexone',
  nrt: 'NRT',
  topiramate: 'Topiramate',
  varenicline: 'Varenicline',
  'other-treatment': 'Other',
};

export const DRAFT_TOPIC_SLUGS = CANONICAL_TOPIC_SLUGS;
export const DRAFT_SUBSTANCE_SLUGS = CANONICAL_SUBSTANCE_SLUGS;
export const DRAFT_TREATMENT_SLUGS = CANONICAL_TREATMENT_SLUGS;

export type DraftTopicSlug = CanonicalTopicSlug;
export type DraftSubstanceSlug = CanonicalSubstanceSlug;
export type DraftTreatmentSlug = CanonicalTreatmentSlug;
