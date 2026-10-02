import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import { SYNTHETIC_PLACEHOLDER_SLUGS } from './placeholder-archiver';
import { parseSeedQuestionFile } from './question-parser';

let fixtureSlugs: string[];
beforeAll(async () => {
  const directory = path.resolve('content/questions/placeholder');
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith('.mdx'),
  );
  fixtureSlugs = await Promise.all(
    files.map(async (file) => {
      const filename = path.join(directory, file);
      return parseSeedQuestionFile(await readFile(filename, 'utf8'), filename)
        .slug;
    }),
  );
});
it('names exactly the committed synthetic fixture slugs', () => {
  expect([...SYNTHETIC_PLACEHOLDER_SLUGS].sort()).toEqual(fixtureSlugs.sort());
});
