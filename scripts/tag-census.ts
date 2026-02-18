import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import {
  CANONICAL_SUBSTANCE_SLUGS,
  CANONICAL_TOPIC_SLUGS,
  CANONICAL_TREATMENT_SLUGS,
} from '../lib/content/draftTaxonomy';

type TagKind = 'topic' | 'substance' | 'treatment' | 'diagnosis';

type TagRow = {
  slug: string;
  name: string;
  kind: TagKind;
};

type ParsedArgs = {
  outPath: string | null;
  threshold: number;
};

const DEFAULT_THRESHOLD = 3;
const ALLOWED_KINDS: readonly TagKind[] = [
  'topic',
  'substance',
  'treatment',
  'diagnosis',
];

function parseArgs(argv: string[]): ParsedArgs {
  let outPath: string | null = null;
  let threshold = DEFAULT_THRESHOLD;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx scripts/tag-census.ts [--out <path>] [--threshold <number>]',
      );
      process.exit(0);
    }

    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --out');
      }
      outPath = value;
      index += 1;
      continue;
    }

    if (arg === '--threshold') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --threshold');
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(
          `--threshold must be a non-negative integer, received "${value}"`,
        );
      }
      threshold = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { outPath, threshold };
}

function formatDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeTags(input: unknown): TagRow[] {
  if (!Array.isArray(input)) return [];
  const rows: TagRow[] = [];
  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object') continue;
    const tag = candidate as Partial<TagRow>;
    if (
      typeof tag.slug !== 'string' ||
      typeof tag.name !== 'string' ||
      typeof tag.kind !== 'string'
    ) {
      continue;
    }
    if (!ALLOWED_KINDS.includes(tag.kind as TagKind)) {
      continue;
    }
    rows.push({
      slug: tag.slug,
      name: tag.name,
      kind: tag.kind as TagKind,
    });
  }
  return rows;
}

function renderKindSummaryTable(input: {
  totalFiles: number;
  tagsByKind: Map<TagKind, number>;
  slugCountsByKind: Map<TagKind, Map<string, number>>;
}): string {
  const lines = [
    '| Kind | Tag assignments | Unique slugs | Avg tags/question |',
    '|---|---:|---:|---:|',
  ];

  for (const kind of ALLOWED_KINDS) {
    const assignmentCount = input.tagsByKind.get(kind) ?? 0;
    const uniqueSlugs = input.slugCountsByKind.get(kind)?.size ?? 0;
    const avg =
      input.totalFiles === 0
        ? '0.00'
        : (assignmentCount / input.totalFiles).toFixed(2);
    lines.push(`| ${kind} | ${assignmentCount} | ${uniqueSlugs} | ${avg} |`);
  }

  return lines.join('\n');
}

function renderPerSlugSection(input: {
  slugCountsByKind: Map<TagKind, Map<string, number>>;
}): string {
  const chunks: string[] = [];

  for (const kind of ALLOWED_KINDS) {
    const map = input.slugCountsByKind.get(kind) ?? new Map<string, number>();
    const rows = [...map.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    });

    chunks.push(`### ${kind}`);
    chunks.push('');
    chunks.push('| Slug | Count |');
    chunks.push('|---|---:|');
    if (rows.length === 0) {
      chunks.push('| _(none)_ | 0 |');
    } else {
      for (const [slug, count] of rows) {
        chunks.push(`| \`${slug}\` | ${count} |`);
      }
    }
    chunks.push('');
  }

  return chunks.join('\n');
}

function renderGapList(input: {
  slugCountsByKind: Map<TagKind, Map<string, number>>;
  threshold: number;
}): string {
  const canonicalByKind = {
    topic: CANONICAL_TOPIC_SLUGS,
    substance: CANONICAL_SUBSTANCE_SLUGS,
    treatment: CANONICAL_TREATMENT_SLUGS,
  } as const;

  const lines: string[] = [];
  for (const [kind, canonicalSlugs] of Object.entries(canonicalByKind)) {
    const counts =
      input.slugCountsByKind.get(kind as TagKind) ?? new Map<string, number>();

    const zero = canonicalSlugs.filter((slug) => (counts.get(slug) ?? 0) === 0);
    const low = canonicalSlugs.filter((slug) => {
      const value = counts.get(slug) ?? 0;
      return value > 0 && value <= input.threshold;
    });

    lines.push(`### ${kind}`);
    lines.push('');
    lines.push(
      `- Zero-count slugs: ${
        zero.length > 0 ? zero.map((slug) => `\`${slug}\``).join(', ') : 'None'
      }`,
    );
    lines.push(
      `- Low-count slugs (<= ${input.threshold} questions): ${
        low.length > 0 ? low.map((slug) => `\`${slug}\``).join(', ') : 'None'
      }`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

function renderNonCanonicalSlugs(input: {
  slugCountsByKind: Map<TagKind, Map<string, number>>;
}): string {
  const canonicalSets = {
    topic: new Set<string>(CANONICAL_TOPIC_SLUGS),
    substance: new Set<string>(CANONICAL_SUBSTANCE_SLUGS),
    treatment: new Set<string>(CANONICAL_TREATMENT_SLUGS),
  } as const;

  const lines: string[] = [];

  for (const [kind, set] of Object.entries(canonicalSets)) {
    const map =
      input.slugCountsByKind.get(kind as TagKind) ?? new Map<string, number>();
    const unknown = [...map.entries()]
      .filter(([slug]) => !set.has(slug))
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0]);
      });

    lines.push(
      `- ${kind}: ${
        unknown.length > 0
          ? unknown.map(([slug, count]) => `\`${slug}\` (${count})`).join(', ')
          : 'None'
      }`,
    );
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await fg('content/questions/**/*.mdx', {
    onlyFiles: true,
    unique: true,
  });

  const tagsByKind = new Map<TagKind, number>();
  const slugCountsByKind = new Map<TagKind, Map<string, number>>();

  for (const kind of ALLOWED_KINDS) {
    tagsByKind.set(kind, 0);
    slugCountsByKind.set(kind, new Map<string, number>());
  }

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { data } = matter(raw);
    const tags = normalizeTags((data as { tags?: unknown }).tags);

    for (const tag of tags) {
      tagsByKind.set(tag.kind, (tagsByKind.get(tag.kind) ?? 0) + 1);
      const bySlug = slugCountsByKind.get(tag.kind);
      if (!bySlug) continue;
      bySlug.set(tag.slug, (bySlug.get(tag.slug) ?? 0) + 1);
    }
  }

  const generatedDate = formatDateIso(new Date());
  const markdown = [
    `# Tag Census Report (${generatedDate})`,
    '',
    `- Generated by: \`scripts/tag-census.ts\``,
    `- Questions scanned: **${files.length}**`,
    `- Canonical low-count threshold: **<= ${args.threshold}**`,
    '',
    '## Per-kind Distribution',
    '',
    renderKindSummaryTable({
      totalFiles: files.length,
      tagsByKind,
      slugCountsByKind,
    }),
    '',
    '## Per-slug Counts (Sorted by Count Desc)',
    '',
    renderPerSlugSection({ slugCountsByKind }),
    '## Content Gaps',
    '',
    renderGapList({ slugCountsByKind, threshold: args.threshold }),
    '## Non-Canonical Slug Audit',
    '',
    renderNonCanonicalSlugs({ slugCountsByKind }),
    '',
  ].join('\n');

  if (args.outPath) {
    const outputPath = path.resolve(args.outPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown, 'utf8');
    console.log(`Wrote census report to ${outputPath}`);
    return;
  }

  console.log(markdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[tag-census] ${message}`);
  process.exit(1);
});
