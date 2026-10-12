import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSeedQuestionFiles } from './file-reader';

describe('readSeedQuestionFiles', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'seed-file-reader-'));
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  function writeQuestion(relativePath: string, raw = relativePath) {
    const absolutePath = path.join(directory, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, raw);
    return { absolutePath, raw };
  }

  it('reads nested MDX files with absolute paths and their unchanged contents', async () => {
    const first = writeQuestion('content/questions/imported/a.mdx', 'First\n');
    const second = writeQuestion(
      'content/questions/imported/nested/b.mdx',
      'Second\r\n',
    );
    writeQuestion('content/questions/imported/notes.md');
    writeQuestion('content/questions/imported/.hidden.mdx');
    writeQuestion('content/questions/.hidden/question.mdx');
    writeQuestion('content/elsewhere/question.mdx');
    mkdirSync(path.join(directory, 'content/questions/directory.mdx'));

    const files = await readSeedQuestionFiles(false);

    expect(files).toHaveLength(2);
    expect(files).toEqual(expect.arrayContaining([first, second]));
  });

  it.each([false, true])(
    'includes placeholders only when requested (includePlaceholders=%s)',
    async (includePlaceholders) => {
      const imported = writeQuestion('content/questions/imported/a.mdx');
      const placeholder = writeQuestion('content/questions/placeholder/a.mdx');
      const nested = writeQuestion(
        'content/questions/placeholder/nested/b.mdx',
      );

      const files = await readSeedQuestionFiles(includePlaceholders);

      const expected = includePlaceholders
        ? [imported, placeholder, nested]
        : [imported];
      expect(files).toHaveLength(expected.length);
      expect(files).toEqual(expect.arrayContaining(expected));
    },
  );

  it('reads linked files and directories while ignoring dangling links', async () => {
    const original = writeQuestion('content/questions/imported/a.mdx');
    const root = path.join(directory, 'content/questions');
    symlinkSync('imported', path.join(root, 'linked-directory'));
    symlinkSync('imported/a.mdx', path.join(root, 'linked-file.mdx'));
    symlinkSync('missing.mdx', path.join(root, 'dangling.mdx'));

    const files = await readSeedQuestionFiles(false);

    expect(files).toHaveLength(3);
    expect(files).toEqual(
      expect.arrayContaining([
        original,
        {
          absolutePath: path.join(root, 'linked-directory/a.mdx'),
          raw: original.raw,
        },
        { absolutePath: path.join(root, 'linked-file.mdx'), raw: original.raw },
      ]),
    );
  });

  it('refuses an empty question tree when placeholders are included', async () => {
    await expect(readSeedQuestionFiles(true)).rejects.toThrow(
      'No question files found at content/questions/**/*.mdx',
    );
  });

  it('refuses a tree containing only excluded placeholders', async () => {
    writeQuestion('content/questions/placeholder/a.mdx');

    await expect(readSeedQuestionFiles(false)).rejects.toThrow(
      'No question files found after excluding placeholders',
    );
  });
});
