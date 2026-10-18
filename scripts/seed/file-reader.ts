import { readFile } from 'node:fs/promises';
import { glob } from 'tinyglobby';

const ALL_QUESTION_PATTERNS = ['content/questions/**/*.mdx'] as const;
const NON_PLACEHOLDER_PATTERNS = [
  'content/questions/**/*.mdx',
  '!content/questions/placeholder/**/*.mdx',
] as const;

export type SeedSourceFile = {
  absolutePath: string;
  raw: string;
};

function getSeedPatterns(includePlaceholders: boolean): readonly string[] {
  return includePlaceholders ? ALL_QUESTION_PATTERNS : NON_PLACEHOLDER_PATTERNS;
}

function getMissingFilesMessage(includePlaceholders: boolean): string {
  return includePlaceholders
    ? 'No question files found at content/questions/**/*.mdx. Seed requires at least one MDX file.'
    : 'No question files found after excluding placeholders. Re-run with --include-placeholders or generate imported content under content/questions/imported/.';
}

export async function readSeedQuestionFiles(
  includePlaceholders: boolean,
): Promise<SeedSourceFile[]> {
  const filePaths = await glob(getSeedPatterns(includePlaceholders), {
    onlyFiles: true,
    absolute: true,
    dot: false,
    expandDirectories: false,
  });

  if (filePaths.length === 0) {
    throw new Error(getMissingFilesMessage(includePlaceholders));
  }

  return Promise.all(
    filePaths.map(async (absolutePath) => ({
      absolutePath,
      raw: await readFile(absolutePath, 'utf8'),
    })),
  );
}
