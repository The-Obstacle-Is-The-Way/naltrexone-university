import { z } from 'zod';
import {
  CANONICAL_SUBSTANCE_SLUGS,
  CANONICAL_TOPIC_SLUGS,
  CANONICAL_TREATMENT_SLUGS,
} from './draftTaxonomy';

const CANONICAL_TOPIC_SLUG_SET = new Set<string>(CANONICAL_TOPIC_SLUGS);
const CANONICAL_SUBSTANCE_SLUG_SET = new Set<string>(CANONICAL_SUBSTANCE_SLUGS);
const CANONICAL_TREATMENT_SLUG_SET = new Set<string>(CANONICAL_TREATMENT_SLUGS);
const ChoiceExplanationSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: 'explanation must not be blank',
  });

export const ChoiceFrontmatterSchema = z
  .object({
    label: z.string().regex(/^[A-E]$/, 'label must be A-E'),
    text: z.string().min(1),
    correct: z.boolean(),
    explanation: ChoiceExplanationSchema.optional(),
  })
  .strict();

export const TagFrontmatterSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: z.enum(['topic', 'substance', 'treatment', 'diagnosis']),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind === 'topic' && !CANONICAL_TOPIC_SLUG_SET.has(val.slug)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `topic slug must be one of: ${CANONICAL_TOPIC_SLUGS.join(', ')}`,
        path: ['slug'],
      });
    }

    if (
      val.kind === 'substance' &&
      !CANONICAL_SUBSTANCE_SLUG_SET.has(val.slug)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `substance slug must be one of: ${CANONICAL_SUBSTANCE_SLUGS.join(', ')}`,
        path: ['slug'],
      });
    }

    if (
      val.kind === 'treatment' &&
      !CANONICAL_TREATMENT_SLUG_SET.has(val.slug)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `treatment slug must be one of: ${CANONICAL_TREATMENT_SLUGS.join(', ')}`,
        path: ['slug'],
      });
    }
  });

export const QuestionFrontmatterSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    status: z.enum(['draft', 'published', 'archived']),
    tags: z.array(TagFrontmatterSchema).max(50),
    choices: z.array(ChoiceFrontmatterSchema).min(2).max(5),
  })
  .strict()
  .superRefine((val, ctx) => {
    const correctCount = val.choices.filter((c) => c.correct).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'choices must contain exactly 1 correct=true',
        path: ['choices'],
      });
    }
    const labelSet = new Set(val.choices.map((c) => c.label));
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
    }

    const tagSlugSet = new Set(val.tags.map((t) => t.slug));
    if (tagSlugSet.size !== val.tags.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tag slugs must be unique',
        path: ['tags'],
      });
    }

    const topicCount = val.tags.filter((tag) => tag.kind === 'topic').length;
    if (topicCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'at least one topic tag is required',
        path: ['tags'],
      });
    }

    const substanceCount = val.tags.filter(
      (tag) => tag.kind === 'substance',
    ).length;
    if (substanceCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'at least one substance tag is required',
        path: ['tags'],
      });
    }
  });

export const FullQuestionSchema = z
  .object({
    frontmatter: QuestionFrontmatterSchema,
    stemMd: z.string().min(1),
    explanationMd: z.string().min(1),
  })
  .strict();
