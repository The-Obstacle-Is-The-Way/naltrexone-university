import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { parseMdxQuestionBody } from '../lib/content/parseMdxQuestion';

type CanonicalKind = 'topic' | 'substance' | 'treatment' | 'diagnosis';

export type MigrationTag = {
  slug: string;
  name: string;
  kind: CanonicalKind | 'domain';
};

export type MigrationInput = {
  filePath: string;
  stemMd: string;
  explanationMd: string;
  choices: ReadonlyArray<{ text: string }>;
  tags: ReadonlyArray<MigrationTag>;
};

type ReportMode = 'dry-run' | 'write';

export type MigrationFailure = {
  filePath: string;
  message: string;
};

export type MigrationReport = {
  mode: ReportMode;
  scannedFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  writtenFiles: number;
  failedFiles: number;
  tagCountsByKind: Record<string, number>;
  failures: MigrationFailure[];
};

export type CliArgs = {
  mode: ReportMode;
  reportPath: string | null;
};

const TOPIC_DISPLAY_NAMES = {
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
} as const;

const SUBSTANCE_DISPLAY_NAMES = {
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
} as const;

const TREATMENT_DISPLAY_NAMES = {
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
} as const;

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

const CANONICAL_TOPIC_SLUGS = new Set(Object.keys(TOPIC_DISPLAY_NAMES));
const CANONICAL_SUBSTANCE_SLUGS = new Set(Object.keys(SUBSTANCE_DISPLAY_NAMES));
const CANONICAL_TREATMENT_SLUGS = new Set(Object.keys(TREATMENT_DISPLAY_NAMES));

function canonicalTopicName(slug: string): string {
  const value = TOPIC_DISPLAY_NAMES[slug as keyof typeof TOPIC_DISPLAY_NAMES];
  if (!value) {
    throw new Error(`Unknown canonical topic slug: ${slug}`);
  }
  return value;
}

function canonicalSubstanceName(slug: string): string {
  const value =
    SUBSTANCE_DISPLAY_NAMES[slug as keyof typeof SUBSTANCE_DISPLAY_NAMES];
  if (!value) {
    throw new Error(`Unknown canonical substance slug: ${slug}`);
  }
  return value;
}

function canonicalTreatmentName(slug: string): string {
  const value =
    TREATMENT_DISPLAY_NAMES[slug as keyof typeof TREATMENT_DISPLAY_NAMES];
  if (!value) {
    throw new Error(`Unknown canonical treatment slug: ${slug}`);
  }
  return value;
}

function isPlaceholder07(filePath: string): boolean {
  return filePath.includes('placeholder-07-stimulant-intoxication-management');
}

function inferDomainTopicSlug(
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

function mapLegacyTopicSlug(slug: string, filePath: string): string {
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

function addOrValidateTag(
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
}

function inferTreatmentSlugs(input: MigrationInput): string[] {
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

function validateInvariants(tags: readonly MigrationTag[]): void {
  if (tags.some((tag) => tag.kind === 'domain')) {
    throw new Error('Invariant failed: domain tags remain after migration');
  }

  const topicCount = tags.filter((tag) => tag.kind === 'topic').length;
  const substanceCount = tags.filter((tag) => tag.kind === 'substance').length;
  if (topicCount === 0) {
    throw new Error(
      'Invariant failed: migrated question must have at least one topic tag',
    );
  }
  if (substanceCount === 0) {
    throw new Error(
      'Invariant failed: migrated question must have at least one substance tag',
    );
  }

  for (const tag of tags) {
    if (tag.kind === 'topic') {
      if (tag.slug === 'topic' || tag.slug === 'psychosocial') {
        throw new Error(
          `Invariant failed: rogue topic slug "${tag.slug}" found`,
        );
      }
      if (!CANONICAL_TOPIC_SLUGS.has(tag.slug)) {
        throw new Error(
          `Invariant failed: unknown canonical topic slug "${tag.slug}"`,
        );
      }
    }
    if (tag.kind === 'substance' && !CANONICAL_SUBSTANCE_SLUGS.has(tag.slug)) {
      throw new Error(
        `Invariant failed: unknown canonical substance slug "${tag.slug}"`,
      );
    }
    if (tag.kind === 'treatment' && !CANONICAL_TREATMENT_SLUGS.has(tag.slug)) {
      throw new Error(
        `Invariant failed: unknown canonical treatment slug "${tag.slug}"`,
      );
    }
  }
}

export function migrateQuestionTags(input: MigrationInput): MigrationTag[] {
  const bySlug = new Map<string, MigrationTag>();
  const inputTopicSlugs = new Set(
    input.tags.filter((tag) => tag.kind === 'topic').map((tag) => tag.slug),
  );

  for (const tag of input.tags) {
    if (tag.kind === 'domain') {
      const mappedTopicSlug = inferDomainTopicSlug(tag.slug, inputTopicSlugs);
      addOrValidateTag(bySlug, {
        slug: mappedTopicSlug,
        name: canonicalTopicName(mappedTopicSlug),
        kind: 'topic',
      });
      continue;
    }

    if (tag.kind === 'topic') {
      const mappedTopicSlug = mapLegacyTopicSlug(tag.slug, input.filePath);
      addOrValidateTag(bySlug, {
        slug: mappedTopicSlug,
        name: canonicalTopicName(mappedTopicSlug),
        kind: 'topic',
      });
      continue;
    }

    if (tag.kind === 'substance') {
      addOrValidateTag(bySlug, {
        slug: tag.slug,
        name: canonicalSubstanceName(tag.slug),
        kind: 'substance',
      });
      continue;
    }

    if (tag.kind === 'treatment') {
      addOrValidateTag(bySlug, {
        slug: tag.slug,
        name: canonicalTreatmentName(tag.slug),
        kind: 'treatment',
      });
      continue;
    }

    if (tag.kind === 'diagnosis') {
      addOrValidateTag(bySlug, tag);
      continue;
    }

    throw new Error(`Unknown tag kind "${tag.kind}"`);
  }

  for (const slug of inferTreatmentSlugs(input)) {
    addOrValidateTag(bySlug, {
      slug,
      name: canonicalTreatmentName(slug),
      kind: 'treatment',
    });
  }

  const migrated = [...bySlug.values()];
  validateInvariants(migrated);
  return migrated;
}

function parseTags(rawTags: unknown, filePath: string): MigrationTag[] {
  if (!Array.isArray(rawTags)) {
    throw new Error(
      `Invalid tags frontmatter in ${filePath}: expected an array`,
    );
  }

  return rawTags.map((rawTag, index) => {
    if (!rawTag || typeof rawTag !== 'object') {
      throw new Error(
        `Invalid tag at index ${index} in ${filePath}: expected object`,
      );
    }

    const record = rawTag as Record<string, unknown>;
    if (typeof record.slug !== 'string' || record.slug.length === 0) {
      throw new Error(
        `Invalid tag slug at index ${index} in ${filePath}: expected non-empty string`,
      );
    }
    if (typeof record.name !== 'string' || record.name.length === 0) {
      throw new Error(
        `Invalid tag name at index ${index} in ${filePath}: expected non-empty string`,
      );
    }
    if (typeof record.kind !== 'string' || record.kind.length === 0) {
      throw new Error(
        `Invalid tag kind at index ${index} in ${filePath}: expected non-empty string`,
      );
    }

    return {
      slug: record.slug,
      name: record.name,
      kind: record.kind as MigrationTag['kind'],
    };
  });
}

function parseChoiceTexts(rawChoices: unknown): Array<{ text: string }> {
  if (!Array.isArray(rawChoices)) {
    return [];
  }

  return rawChoices.flatMap((rawChoice) => {
    if (!rawChoice || typeof rawChoice !== 'object') {
      return [];
    }

    const record = rawChoice as Record<string, unknown>;
    if (typeof record.text !== 'string' || record.text.length === 0) {
      return [];
    }

    return [{ text: record.text }];
  });
}

function tagsSignature(tags: readonly MigrationTag[]): string {
  return JSON.stringify(
    tags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      kind: tag.kind,
    })),
  );
}

function emptyTagCounts(): Record<string, number> {
  return {
    topic: 0,
    substance: 0,
    treatment: 0,
    diagnosis: 0,
    domain: 0,
  };
}

function incrementTagCounts(
  counts: Record<string, number>,
  tags: readonly MigrationTag[],
): void {
  for (const tag of tags) {
    counts[tag.kind] = (counts[tag.kind] ?? 0) + 1;
  }
}

export function parseCliArgs(argv: string[]): CliArgs {
  let mode: ReportMode = 'dry-run';
  let reportPath: string | null = null;

  const args = [...argv];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      mode = 'dry-run';
      continue;
    }

    if (arg === '--write') {
      mode = 'write';
      continue;
    }

    if (arg === '--report') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --report');
      }
      reportPath = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { mode, reportPath };
}

export async function runMigration(args: CliArgs): Promise<MigrationReport> {
  const files = await fg(['content/questions/**/*.mdx'], {
    onlyFiles: true,
    unique: true,
    absolute: true,
    dot: false,
  });

  const report: MigrationReport = {
    mode: args.mode,
    scannedFiles: files.length,
    changedFiles: 0,
    unchangedFiles: 0,
    writtenFiles: 0,
    failedFiles: 0,
    tagCountsByKind: emptyTagCounts(),
    failures: [],
  };

  for (const absoluteFilePath of files) {
    const filePath = path.relative(process.cwd(), absoluteFilePath);
    try {
      const raw = await readFile(absoluteFilePath, 'utf8');
      const { data, content } = matter(raw);
      const parsed = parseMdxQuestionBody(content);

      const tags = parseTags(data.tags, filePath);
      const migratedTags = migrateQuestionTags({
        filePath,
        stemMd: parsed.stemMd,
        explanationMd: parsed.explanationMd,
        choices: parseChoiceTexts(data.choices),
        tags,
      });
      incrementTagCounts(report.tagCountsByKind, migratedTags);

      const changed = tagsSignature(tags) !== tagsSignature(migratedTags);
      if (changed) {
        report.changedFiles += 1;
      } else {
        report.unchangedFiles += 1;
      }

      if (args.mode === 'write' && changed) {
        const updatedRaw = matter.stringify(content, {
          ...data,
          tags: migratedTags,
        });
        await writeFile(absoluteFilePath, updatedRaw, 'utf8');
        report.writtenFiles += 1;
      }
    } catch (error) {
      report.failedFiles += 1;
      const message = error instanceof Error ? error.message : String(error);
      report.failures.push({ filePath, message });
    }
  }

  if (args.reportPath) {
    await writeFile(args.reportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  if (report.failedFiles > 0) {
    throw new Error(`Migration failed for ${report.failedFiles} files`);
  }

  return report;
}

export async function runMigrationCli(
  argv: string[],
): Promise<MigrationReport> {
  const args = parseCliArgs(argv);
  return runMigration(args);
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runMigrationCli(process.argv.slice(2))
    .then((report) => {
      console.info(`Mode: ${report.mode}`);
      console.info(`Scanned files: ${report.scannedFiles}`);
      console.info(`Changed files: ${report.changedFiles}`);
      console.info(`Unchanged files: ${report.unchangedFiles}`);
      console.info(`Written files: ${report.writtenFiles}`);
      console.info(`Failed files: ${report.failedFiles}`);
      if (report.failures.length > 0) {
        console.info('Failures:');
        for (const failure of report.failures) {
          console.info(`  - ${failure.filePath}: ${failure.message}`);
        }
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
