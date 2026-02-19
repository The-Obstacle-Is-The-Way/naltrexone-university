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
} from '../../lib/content/parseMdxQuestion';
import {
  FullQuestionSchema,
  QuestionFrontmatterSchema,
} from '../../lib/content/schemas';
import { parseChoiceExplanations } from '../seed-helpers';

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
  difficulty: QuestionDifficulty;
  status: QuestionStatus;
  choices: SeedChoice[];
  tags: SeedTag[];
};

function buildSeedRepFromParsed(full: unknown): SeedQuestionRep {
  const parsed = FullQuestionSchema.parse(full);
  const parsedExplanations = parseChoiceExplanations(parsed.explanationMd);
  const generalExplanation = parsedExplanations.generalExplanation;

  const sortedTags = [...parsed.frontmatter.tags].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const sortedChoices = [...parsed.frontmatter.choices].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const validLabels = new Set(sortedChoices.map((choice) => choice.label));

  for (const label of parsedExplanations.perChoice.keys()) {
    if (!validLabels.has(label)) {
      throw new Error(
        `Explanation references choice label "${label}" that is not present in choices for slug "${parsed.frontmatter.slug}"`,
      );
    }
  }

  return {
    slug: parsed.frontmatter.slug,
    stem_md: canonicalizeMarkdown(parsed.stemMd),
    explanation_md: generalExplanation,
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
      explanation_md: parsedExplanations.perChoice.get(choice.label) ?? null,
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
