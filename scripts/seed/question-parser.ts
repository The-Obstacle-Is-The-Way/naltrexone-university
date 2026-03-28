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
import {
  containsWrongAnswersHeading,
  parseChoiceExplanations,
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
  const hasYamlExplanations = parsed.frontmatter.choices.some(
    (choice) => choice.explanation !== undefined,
  );

  const sortedTags = [...parsed.frontmatter.tags].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const sortedChoices = [...parsed.frontmatter.choices].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  let generalExplanation: string;
  let referenceMd: string | null;
  let choiceExplanationLookup: ReadonlyMap<string, string> = new Map();

  if (hasYamlExplanations) {
    if (containsWrongAnswersHeading(parsed.explanationMd)) {
      throw new Error(
        `${slug}: new-format question must not include **Why other answers are wrong:** markdown section`,
      );
    }

    const parsedExplanationBody = parseExplanationAndReference(
      parsed.explanationMd,
    );
    generalExplanation = parsedExplanationBody.generalExplanation;
    referenceMd = parsedExplanationBody.referenceMd;

    for (const choice of sortedChoices) {
      if (choice.correct && choice.explanation !== undefined) {
        throw new Error(
          `${slug}: new-format question must not include explanation for correct choice ${choice.label}`,
        );
      }

      if (!choice.correct && choice.explanation === undefined) {
        throw new Error(
          `${slug}: new-format question has wrong choice ${choice.label} missing explanation`,
        );
      }
    }
  } else {
    let parsedExplanations: ReturnType<typeof parseChoiceExplanations>;
    try {
      parsedExplanations = parseChoiceExplanations(parsed.explanationMd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${slug}: ${message}`);
    }

    generalExplanation = parsedExplanations.generalExplanation;
    referenceMd = parsedExplanations.referenceMd;
    choiceExplanationLookup = parsedExplanations.perChoice;

    const validLabels = new Set(sortedChoices.map((choice) => choice.label));
    for (const label of parsedExplanations.perChoice.keys()) {
      if (!validLabels.has(label)) {
        throw new Error(
          `Explanation references choice label "${label}" that is not present in choices for slug "${parsed.frontmatter.slug}"`,
        );
      }
    }
  }

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
      explanation_md: hasYamlExplanations
        ? (choice.explanation ?? null)
        : (choiceExplanationLookup.get(choice.label) ?? null),
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
