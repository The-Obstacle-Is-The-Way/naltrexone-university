import { z } from 'zod';

export const ChoiceFrontmatterSchema = z
  .object({
    label: z.string().regex(/^[A-E]$/, 'label must be A-E'),
    text: z.string().min(1),
    correct: z.boolean(),
  })
  .strict();

export const TagFrontmatterSchema = z
  .object({
    slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: z.enum(['domain', 'topic', 'substance', 'treatment', 'diagnosis']),
  })
  .strict();

export const QuestionFrontmatterSchema = z
  .object({
    slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    status: z.enum(['draft', 'published', 'archived']),
    tags: z.array(TagFrontmatterSchema).max(50),
    choices: z.array(ChoiceFrontmatterSchema).min(2).max(6),
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
  });

export const FullQuestionSchema = z
  .object({
    frontmatter: QuestionFrontmatterSchema,
    stemMd: z.string().min(1),
    explanationMd: z.string().min(1),
  })
  .strict();

