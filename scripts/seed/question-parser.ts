import matter from 'gray-matter';
import type {
  Choice,
  Question,
  QuestionDifficulty,
  QuestionStatus,
  TagKind,
} from '../../db/schema';
import {
  canonicalizeMarkdown,
  parseMdxQuestionBody,
} from '../../lib/content/parse-mdx-question';
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
      explanation_md: choice.explanation ?? null,
      sort_order: index + 1,
    })),
  };
}

export function parseSeedQuestionFile(raw: string): SeedQuestionRep {
  const { data, content } = matter(raw);
  const frontmatter = QuestionFrontmatterSchema.parse(data);
  const { stemMd, explanationMd } = parseMdxQuestionBody(content);

  return buildSeedRepFromParsed({
    frontmatter,
    stemMd,
    explanationMd,
  });
}

export function buildSeedRepFromDb(
  question: Question,
  choices: Choice[],
  tags: SeedTag[],
): SeedQuestionRep {
  return {
    slug: question.slug,
    stem_md: canonicalizeMarkdown(question.stemMd),
    explanation_md: canonicalizeMarkdown(question.explanationMd),
    reference_md: question.referenceMd
      ? canonicalizeMarkdown(question.referenceMd)
      : null,
    difficulty: question.difficulty,
    status: question.status,
    choices: [...choices]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((choice) => ({
        label: choice.label,
        text_md: canonicalizeMarkdown(choice.textMd),
        is_correct: choice.isCorrect,
        explanation_md: choice.explanationMd
          ? canonicalizeMarkdown(choice.explanationMd)
          : null,
        sort_order: choice.sortOrder,
      })),
    tags: [...tags].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}
