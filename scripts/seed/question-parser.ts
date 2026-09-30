import path from 'node:path';
import matter from 'gray-matter';
import type {
  Choice,
  QuestionDifficulty,
  QuestionRevision,
  QuestionStatus,
  TagKind,
} from '../../db/schema';
import {
  canonicalizeMarkdown,
  parseMdxQuestionBody,
} from '../../lib/content/parse-mdx-question';
import type { QuestionRevisionFields } from '../../lib/content/question-revision-hash';
import {
  FullQuestionSchema,
  QuestionFrontmatterSchema,
} from '../../lib/content/schemas';
import {
  containsWrongAnswersHeading,
  parseExplanationAndReference,
} from '../seed-helpers';

export type SeedTag = {
  slug: string;
  name: string;
  kind: TagKind;
};

export type SeedChoice = {
  label: string;
  text_md: string;
  is_correct: boolean;
  explanation_md: string | null;
  sort_order: number;
};

export type SeedQuestionRep = {
  slug: string;
  stem_md: string;
  explanation_md: string;
  reference_md: string | null;
  difficulty: QuestionDifficulty;
  status: QuestionStatus;
  choices: SeedChoice[];
  tags: SeedTag[];
};

function buildSeedRepFromParsed(full: unknown): SeedQuestionRep {
  const parsed = FullQuestionSchema.parse(full);
  const slug = parsed.frontmatter.slug;

  const sortedTags = [...parsed.frontmatter.tags].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const sortedChoices = [...parsed.frontmatter.choices].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  if (containsWrongAnswersHeading(parsed.explanationMd)) {
    throw new Error(
      `${slug}: new-format question must not include **Why other answers are wrong:** markdown section`,
    );
  }

  const parsedExplanationBody = parseExplanationAndReference(
    parsed.explanationMd,
  );
  const generalExplanation = parsedExplanationBody.generalExplanation;
  const referenceMd = parsedExplanationBody.referenceMd;

  return {
    slug: parsed.frontmatter.slug,
    stem_md: canonicalizeMarkdown(parsed.stemMd),
    explanation_md: generalExplanation,
    reference_md: referenceMd,
    difficulty: parsed.frontmatter.difficulty,
    status: parsed.frontmatter.status,
    tags: sortedTags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      kind: tag.kind,
    })),
    choices: sortedChoices.map((choice, index) => ({
      label: choice.label,
      text_md: canonicalizeMarkdown(choice.text),
      is_correct: choice.correct,
      explanation_md: choice.explanation
        ? canonicalizeMarkdown(choice.explanation)
        : null,
      sort_order: index + 1,
    })),
  };
}

export function isSyntheticPlaceholderSource(
  slug: string,
  sourcePath?: string,
): boolean {
  return (
    sourcePath !== undefined &&
    path.dirname(path.resolve(sourcePath)) ===
      path.resolve('content/questions/placeholder') &&
    slug.startsWith('placeholder-')
  );
}

export function parseSeedQuestionFile(
  raw: string,
  sourcePath?: string,
): SeedQuestionRep {
  const { data, content } = matter(raw);
  const frontmatter = QuestionFrontmatterSchema.parse(data);
  const { stemMd, explanationMd } = parseMdxQuestionBody(content);

  const question = buildSeedRepFromParsed({
    frontmatter,
    stemMd,
    explanationMd,
  });

  if (!question.explanation_md) {
    throw new Error('General explanation markdown is empty after parsing');
  }

  // Only the dedicated synthetic seed fixtures may omit a citation. Import
  // conversion supplies no source path and therefore always requires one.
  if (
    !question.reference_md &&
    !isSyntheticPlaceholderSource(question.slug, sourcePath)
  ) {
    throw new Error(
      `${question.slug}: a nonempty terminal Reference is required`,
    );
  }

  return question;
}

// ADR-021: a revision's content in the form the seed compares and writes.
export function revisionFieldsFromSeed(
  seed: SeedQuestionRep,
): QuestionRevisionFields {
  return {
    stemMd: seed.stem_md,
    explanationMd: seed.explanation_md,
    referenceMd: seed.reference_md,
    difficulty: seed.difficulty,
    choices: seed.choices.map((choice) => ({
      label: choice.label,
      textMd: choice.text_md,
      isCorrect: choice.is_correct,
      explanationMd: choice.explanation_md,
      sortOrder: choice.sort_order,
    })),
  };
}

// A stored revision's content, canonicalized as the seed canonicalizes its
// input, so a row written before canonicalization does not read as changed.
export function revisionFieldsFromDb(
  revision: QuestionRevision,
  choices: readonly Choice[],
): QuestionRevisionFields {
  return {
    stemMd: canonicalizeMarkdown(revision.stemMd),
    explanationMd: canonicalizeMarkdown(revision.explanationMd),
    referenceMd: revision.referenceMd
      ? canonicalizeMarkdown(revision.referenceMd)
      : null,
    difficulty: revision.difficulty,
    choices: choices.map((choice) => ({
      label: choice.label,
      textMd: canonicalizeMarkdown(choice.textMd),
      isCorrect: choice.isCorrect,
      explanationMd: choice.explanationMd
        ? canonicalizeMarkdown(choice.explanationMd)
        : null,
      sortOrder: choice.sortOrder,
    })),
  };
}
