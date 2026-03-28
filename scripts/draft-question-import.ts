import matter from 'gray-matter';
import { z } from 'zod';
import {
  CANONICAL_SUBSTANCE_DISPLAY_NAMES,
  CANONICAL_SUBSTANCE_SLUGS,
  CANONICAL_TOPIC_DISPLAY_NAMES,
  CANONICAL_TOPIC_SLUGS,
  CANONICAL_TREATMENT_DISPLAY_NAMES,
  CANONICAL_TREATMENT_SLUGS,
} from '../lib/content/draftTaxonomy';
import { canonicalizeMarkdown } from '../lib/content/parseMdxQuestion';
import { QuestionFrontmatterSchema } from '../lib/content/schemas';

const DraftTagSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'tag slugs must be kebab-case');

const DraftSubstanceSlugSchema = z.enum(CANONICAL_SUBSTANCE_SLUGS);
const DraftTopicSlugSchema = z.enum(CANONICAL_TOPIC_SLUGS);
const DraftTreatmentSlugSchema = z.enum(CANONICAL_TREATMENT_SLUGS);
const DraftExplanationSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: 'explanation must not be blank',
  });

const DraftFrontmatterBaseSchema = z.object({
  qid: z.string().min(1),
  type: z.enum(['recall', 'vignette']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  substances: z.array(DraftSubstanceSlugSchema).min(1),
  topics: z.array(DraftTopicSlugSchema).min(1),
  treatments: z.array(DraftTreatmentSlugSchema).default([]),
  diagnoses: z.array(DraftTagSlugSchema).default([]),
  source: z.string().min(1),
});

const DraftYamlChoiceSchema = z
  .object({
    label: z.string().regex(/^[A-E]$/, 'label must be A-E'),
    text: z.string().min(1),
    correct: z.boolean(),
    explanation: DraftExplanationSchema.optional(),
  })
  .strict();

const DraftFrontmatterSchema = DraftFrontmatterBaseSchema.extend({
  choices: z.array(DraftYamlChoiceSchema).min(2).max(5),
})
  .strict()
  .superRefine((val, ctx) => {
    const correctCount = val.choices.filter((choice) => choice.correct).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'choices must contain exactly 1 correct=true',
        path: ['choices'],
      });
    }

    const labelSet = new Set(val.choices.map((choice) => choice.label));
    if (labelSet.size !== val.choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'choice labels must be unique',
        path: ['choices'],
      });
    }

    for (const [index, choice] of val.choices.entries()) {
      if (choice.correct && choice.explanation !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'correct choices must not include explanation',
          path: ['choices', index, 'explanation'],
        });
      }

      if (!choice.correct && choice.explanation === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'wrong choices must include explanation',
          path: ['choices', index, 'explanation'],
        });
      }
    }
  });

type DraftFrontmatter = z.infer<typeof DraftFrontmatterSchema>;

export type DraftChoice = {
  label: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
  correct: boolean;
  explanation?: string;
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

export function parseDraftQuestionBlock(block: string): DraftQuestion {
  const { data, content } = matter(block);
  const frontmatter = DraftFrontmatterSchema.parse(data);

  const normalized = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));

  const hasChoicesHeading = normalized.some(
    (line) => line.trim() === '## Choices',
  );
  if (hasChoicesHeading) {
    throw new Error('New-format question must not include ## Choices heading');
  }

  const explanationMd = extractAfterHeading(normalized, '## Explanation');
  const stemMd = extractBetweenHeadings(
    normalized,
    ['## Question', '## Stem'],
    '## Explanation',
  );
  const choices = frontmatter.choices.map((choice) => ({
    label: choice.label as DraftChoice['label'],
    text: choice.text,
    correct: choice.correct,
    ...(choice.explanation ? { explanation: choice.explanation } : {}),
  }));

  return {
    frontmatter,
    stemMd,
    explanationMd,
    choices,
  };
}

function diagnosisDisplayNameFromSlug(slug: string): string {
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
}): string {
  const { draft } = input;

  const tags: Array<{
    slug: string;
    name: string;
    kind: 'topic' | 'substance' | 'treatment' | 'diagnosis';
  }> = [];

  for (const slug of draft.frontmatter.substances) {
    tags.push({
      slug,
      name: CANONICAL_SUBSTANCE_DISPLAY_NAMES[slug],
      kind: 'substance',
    });
  }

  for (const slug of draft.frontmatter.topics) {
    tags.push({
      slug,
      name: CANONICAL_TOPIC_DISPLAY_NAMES[slug],
      kind: 'topic',
    });
  }

  for (const slug of draft.frontmatter.treatments) {
    tags.push({
      slug,
      name: CANONICAL_TREATMENT_DISPLAY_NAMES[slug],
      kind: 'treatment',
    });
  }

  for (const slug of draft.frontmatter.diagnoses) {
    tags.push({
      slug,
      name: diagnosisDisplayNameFromSlug(slug),
      kind: 'diagnosis',
    });
  }

  const uniqueTags = new Map<string, (typeof tags)[number]>();
  for (const tag of tags) {
    uniqueTags.set(`${tag.kind}:${tag.slug}`, tag);
  }

  const mdxFrontmatter = {
    slug: draft.frontmatter.qid,
    difficulty: draft.frontmatter.difficulty,
    status: input.status,
    tags: [...uniqueTags.values()],
    choices: draft.choices.map((c) => ({
      label: c.label,
      text: c.text,
      correct: c.correct,
      ...(c.explanation ? { explanation: c.explanation } : {}),
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
    if (choice.explanation) {
      lines.push(`    explanation: ${yamlQuotedString(choice.explanation)}`);
    }
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
