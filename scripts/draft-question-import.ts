import matter from 'gray-matter';
import { z } from 'zod';
import { canonicalizeMarkdown } from '../lib/content/parseMdxQuestion';
import { QuestionFrontmatterSchema } from '../lib/content/schemas';

const DraftFrontmatterSchema = z
  .object({
    qid: z.string().min(1),
    type: z.enum(['recall', 'vignette']),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    substances: z.array(z.string()).default([]),
    topics: z.array(z.string()).default([]),
    source: z.string().min(1),
    answer: z.string().regex(/^[A-E]$/, 'answer must be A-E'),
  })
  .strict();

type DraftFrontmatter = z.infer<typeof DraftFrontmatterSchema>;

export type DraftChoice = {
  label: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
};

export type DraftQuestion = {
  frontmatter: DraftFrontmatter;
  stemMd: string;
  explanationMd: string;
  choices: DraftChoice[];
};

export function splitDraftQuestionsFile(raw: string): string[] {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const startPattern = /^---\nqid:/gm;

  const starts: number[] = [];
  for (
    let match = startPattern.exec(normalized);
    match;
    match = startPattern.exec(normalized)
  ) {
    starts.push(match.index);
  }

  if (starts.length === 0) {
    return [];
  }

  const blocks: string[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1] ?? normalized.length;
    const block = normalized.slice(start, end).trim();
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

function indexOfHeading(lines: string[], candidates: string[]): number {
  return lines.findIndex((line) => candidates.includes(line.trim()));
}

function extractBetweenHeadings(
  lines: string[],
  startHeadingCandidates: string[],
  endHeading: string,
): string {
  const startIndex = indexOfHeading(lines, startHeadingCandidates);
  const endIndex = indexOfHeading(lines, [endHeading]);

  if (startIndex === -1) {
    throw new Error(
      `Missing required heading: ${startHeadingCandidates.join(' or ')}`,
    );
  }
  if (endIndex === -1) {
    throw new Error(`Missing required heading: ${endHeading}`);
  }
  if (endIndex <= startIndex) {
    throw new Error(
      `Invalid heading order: expected ${endHeading} after question heading`,
    );
  }

  return canonicalizeMarkdown(lines.slice(startIndex + 1, endIndex).join('\n'));
}

function extractAfterHeading(lines: string[], heading: string): string {
  const index = indexOfHeading(lines, [heading]);
  if (index === -1) {
    throw new Error(`Missing required heading: ${heading}`);
  }

  const remainder = [...lines.slice(index + 1)];
  while (remainder.length > 0 && remainder.at(-1)?.trim() === '---') {
    remainder.pop();
  }

  return canonicalizeMarkdown(remainder.join('\n'));
}

function parseChoicesBlock(raw: string): DraftChoice[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  const choices: DraftChoice[] = [];
  let current: DraftChoice | null = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) {
      continue;
    }

    const startMatch = trimmed.match(/^-+\s*([A-E])[).:]\s*(.*)$/);
    if (startMatch) {
      const label = startMatch[1] as DraftChoice['label'];
      const text = startMatch[2] ?? '';
      current = { label, text: text.trim() };
      choices.push(current);
      continue;
    }

    if (current && /^\s+/.test(line)) {
      current.text = `${current.text} ${trimmed.trim()}`.trim();
    }
  }

  if (choices.length < 2) {
    throw new Error('Choices parsing failed: expected at least 2 choices');
  }

  return choices;
}

export function parseDraftQuestionBlock(block: string): DraftQuestion {
  const { data, content } = matter(block);
  const frontmatter = DraftFrontmatterSchema.parse(data);

  const normalized = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));

  const stemMd = extractBetweenHeadings(
    normalized,
    ['## Question', '## Stem'],
    '## Choices',
  );
  const rawChoicesBlock = extractBetweenHeadings(
    normalized,
    ['## Choices'],
    '## Explanation',
  );
  const explanationMd = extractAfterHeading(normalized, '## Explanation');

  const choices = parseChoicesBlock(rawChoicesBlock);

  return {
    frontmatter,
    stemMd,
    explanationMd,
    choices,
  };
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function yamlQuotedString(value: string): string {
  return JSON.stringify(value);
}

export function convertDraftQuestionToMdx(input: {
  draft: DraftQuestion;
  status: 'draft' | 'published' | 'archived';
  domainTagSlug?: string;
}): string {
  const { draft } = input;

  const tags: Array<{
    slug: string;
    name: string;
    kind: 'domain' | 'topic' | 'substance' | 'treatment' | 'diagnosis';
  }> = [];

  if (input.domainTagSlug) {
    tags.push({
      slug: input.domainTagSlug,
      name: titleCaseFromSlug(input.domainTagSlug),
      kind: 'domain',
    });
  }

  for (const slug of draft.frontmatter.substances) {
    tags.push({ slug, name: titleCaseFromSlug(slug), kind: 'substance' });
  }

  for (const slug of draft.frontmatter.topics) {
    tags.push({ slug, name: titleCaseFromSlug(slug), kind: 'topic' });
  }

  const uniqueTags = new Map<string, (typeof tags)[number]>();
  for (const tag of tags) {
    uniqueTags.set(tag.slug, tag);
  }

  const answerLabel = draft.frontmatter.answer as DraftChoice['label'];
  const mdxFrontmatter = {
    slug: draft.frontmatter.qid,
    difficulty: draft.frontmatter.difficulty,
    status: input.status,
    tags: [...uniqueTags.values()],
    choices: draft.choices.map((c) => ({
      label: c.label,
      text: c.text,
      correct: c.label === answerLabel,
    })),
  };

  QuestionFrontmatterSchema.parse(mdxFrontmatter);

  const lines: string[] = [];
  lines.push('---');
  lines.push(`slug: ${yamlQuotedString(mdxFrontmatter.slug)}`);
  lines.push(`difficulty: ${yamlQuotedString(mdxFrontmatter.difficulty)}`);
  lines.push(`status: ${yamlQuotedString(mdxFrontmatter.status)}`);

  lines.push('tags:');
  for (const tag of mdxFrontmatter.tags) {
    lines.push(`  - slug: ${yamlQuotedString(tag.slug)}`);
    lines.push(`    name: ${yamlQuotedString(tag.name)}`);
    lines.push(`    kind: ${yamlQuotedString(tag.kind)}`);
  }

  lines.push('choices:');
  for (const choice of mdxFrontmatter.choices) {
    lines.push(`  - label: ${yamlQuotedString(choice.label)}`);
    lines.push(`    text: ${yamlQuotedString(choice.text)}`);
    lines.push(`    correct: ${choice.correct ? 'true' : 'false'}`);
  }

  lines.push('---');
  lines.push('');
  lines.push('## Stem');
  lines.push('');
  lines.push(canonicalizeMarkdown(draft.stemMd));
  lines.push('');
  lines.push('## Explanation');
  lines.push('');
  lines.push(canonicalizeMarkdown(draft.explanationMd));
  lines.push('');

  return lines.join('\n');
}
