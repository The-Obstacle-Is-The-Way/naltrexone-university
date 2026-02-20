import {
  CANONICAL_SUBSTANCE_DISPLAY_NAMES,
  CANONICAL_TOPIC_DISPLAY_NAMES,
  CANONICAL_TREATMENT_DISPLAY_NAMES,
} from '../../lib/content/draftTaxonomy';
import type { MigrationInput, MigrationTag } from './types';

const TOPIC_DISPLAY_NAMES = CANONICAL_TOPIC_DISPLAY_NAMES;
const SUBSTANCE_DISPLAY_NAMES = CANONICAL_SUBSTANCE_DISPLAY_NAMES;
const TREATMENT_DISPLAY_NAMES = CANONICAL_TREATMENT_DISPLAY_NAMES;

const DIRECT_DOMAIN_TO_TOPIC = {
  general: 'general',
  'treatment-pharmacotherapy': 'treatment-pharmacotherapy',
  'pharmacology-neuroscience': 'pharmacology-neuroscience',
  'epidemiology-prevention': 'epidemiology-prevention',
  'screening-diagnosis': 'screening-diagnosis',
  'psychosocial-interventions': 'psychosocial-interventions',
  'ethics-legal-policy': 'ethics-legal',
} as const;

const LEGACY_TOPIC_TO_CANONICAL = {
  comorbidity: 'co-occurring-disorders',
  diagnosis: 'screening-diagnosis',
  epidemiology: 'epidemiology-prevention',
  'ethics-legal': 'ethics-legal',
  'harm-reduction': 'harm-reduction',
  intoxication: 'intoxication-toxicology',
  'medical-complications': 'medical-complications',
  neurobiology: 'pharmacology-neuroscience',
  pharmacology: 'pharmacology-neuroscience',
  psychosocial: 'psychosocial-interventions',
  psychotherapy: 'psychosocial-interventions',
  screening: 'screening-diagnosis',
  'special-populations': 'special-populations',
  toxicology: 'intoxication-toxicology',
  treatment: 'treatment-pharmacotherapy',
  withdrawal: 'withdrawal-management',
} as const;

const MEDICATION_TEXT_MATCHERS = [
  { slug: 'acamprosate', patterns: [/\bacamprosate\b/i] },
  { slug: 'buprenorphine', patterns: [/\bbuprenorphine\b/i] },
  { slug: 'bupropion', patterns: [/\bbupropion\b/i] },
  { slug: 'disulfiram', patterns: [/\bdisulfiram\b/i] },
  { slug: 'gabapentin', patterns: [/\bgabapentin\b/i] },
  { slug: 'methadone', patterns: [/\bmethadone\b/i] },
  { slug: 'naloxone', patterns: [/\bnaloxone\b/i] },
  { slug: 'naltrexone', patterns: [/\bnaltrexone\b/i] },
  { slug: 'topiramate', patterns: [/\btopiramate\b/i] },
  { slug: 'varenicline', patterns: [/\bvarenicline\b/i] },
  {
    slug: 'nrt',
    patterns: [
      /\bnrt\b/i,
      /\bnicotine replacement therapy\b/i,
      /\bnicotine patch\b/i,
      /\bnicotine gum\b/i,
      /\bnicotine lozenge\b/i,
      /\bnicotine inhaler\b/i,
      /\bnicotine spray\b/i,
    ],
  },
] as const;

export const CANONICAL_TOPIC_SLUGS = new Set(Object.keys(TOPIC_DISPLAY_NAMES));
export const CANONICAL_SUBSTANCE_SLUGS = new Set(
  Object.keys(SUBSTANCE_DISPLAY_NAMES),
);
export const CANONICAL_TREATMENT_SLUGS = new Set(
  Object.keys(TREATMENT_DISPLAY_NAMES),
);

export function canonicalTopicName(slug: string): string {
  const value = TOPIC_DISPLAY_NAMES[slug as keyof typeof TOPIC_DISPLAY_NAMES];
  if (!value) {
    throw new Error(`Unknown canonical topic slug: ${slug}`);
  }
  return value;
}

export function canonicalSubstanceName(slug: string): string {
  const value =
    SUBSTANCE_DISPLAY_NAMES[slug as keyof typeof SUBSTANCE_DISPLAY_NAMES];
  if (!value) {
    throw new Error(`Unknown canonical substance slug: ${slug}`);
  }
  return value;
}

export function canonicalTreatmentName(slug: string): string {
  const value =
    TREATMENT_DISPLAY_NAMES[slug as keyof typeof TREATMENT_DISPLAY_NAMES];
  if (!value) {
    throw new Error(`Unknown canonical treatment slug: ${slug}`);
  }
  return value;
}

export function isPlaceholder07(filePath: string): boolean {
  return filePath.includes('placeholder-07-stimulant-intoxication-management');
}

export function inferDomainTopicSlug(
  domainSlug: string,
  inputTopicSlugs: ReadonlySet<string>,
): string {
  if (domainSlug === 'co-occurring-complications') {
    if (inputTopicSlugs.has('comorbidity')) {
      return 'co-occurring-disorders';
    }
    if (inputTopicSlugs.has('medical-complications')) {
      return 'medical-complications';
    }
    throw new Error(
      'Cannot map domain slug "co-occurring-complications": expected topic signal "comorbidity" or "medical-complications"',
    );
  }

  const mapped =
    DIRECT_DOMAIN_TO_TOPIC[domainSlug as keyof typeof DIRECT_DOMAIN_TO_TOPIC];
  if (!mapped) {
    throw new Error(`Unknown domain slug: ${domainSlug}`);
  }
  return mapped;
}

export function mapLegacyTopicSlug(slug: string, filePath: string): string {
  if (slug === 'topic') {
    if (isPlaceholder07(filePath)) {
      return 'intoxication-toxicology';
    }
    throw new Error(
      'Topic slug "topic" requires manual review (only placeholder-07 is auto-remapped)',
    );
  }

  const mapped =
    LEGACY_TOPIC_TO_CANONICAL[slug as keyof typeof LEGACY_TOPIC_TO_CANONICAL];
  if (mapped) {
    return mapped;
  }

  if (CANONICAL_TOPIC_SLUGS.has(slug)) {
    return slug;
  }

  throw new Error(`Unknown topic slug: ${slug}`);
}

export function addOrValidateTag(
  bySlug: Map<string, MigrationTag>,
  nextTag: MigrationTag,
): void {
  const existing = bySlug.get(nextTag.slug);
  if (!existing) {
    bySlug.set(nextTag.slug, nextTag);
    return;
  }

  if (existing.kind !== nextTag.kind) {
    throw new Error(
      `Tag slug "${nextTag.slug}" has conflicting kinds: ${existing.kind} vs ${nextTag.kind}`,
    );
  }

  if (existing.name !== nextTag.name) {
    throw new Error(
      `Tag slug "${nextTag.slug}" has conflicting names: "${existing.name}" vs "${nextTag.name}"`,
    );
  }
}

export function inferTreatmentSlugs(input: MigrationInput): string[] {
  const scanCorpus = [
    input.stemMd,
    input.explanationMd,
    ...input.choices.map((choice) => choice.text),
  ].join('\n');

  const slugs: string[] = [];
  for (const matcher of MEDICATION_TEXT_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(scanCorpus))) {
      slugs.push(matcher.slug);
    }
  }

  return slugs;
}
