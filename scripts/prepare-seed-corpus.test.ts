import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prepareSeedCorpus } from './prepare-seed-corpus';

let root: string;
let contentRoot: string;
let importedRoot: string;

async function writeImported(fileName: string, body: string) {
  await mkdir(importedRoot, { recursive: true });
  await writeFile(path.join(importedRoot, fileName), body);
}

// Like the real importer, a --dry-run call validates without writing.
function isDryRun(args: readonly string[]): boolean {
  return args.includes('--dry-run');
}

function outArgument(args: readonly string[]): string {
  const index = args.indexOf('--out');
  const out = args[index + 1];
  if (index === -1 || out === undefined) throw new Error('missing --out');
  return out;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'prepare-seed-corpus-'));
  contentRoot = path.join(root, 'content');
  importedRoot = path.join(contentRoot, 'questions', 'imported');
  await mkdir(path.join(contentRoot, 'questions'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('prepareSeedCorpus', () => {
  it('imports into fresh staging outside the seed glob, then swaps it in', async () => {
    await writeImported('old.mdx', 'old');
    const calls: string[][] = [];

    await prepareSeedCorpus({
      contentRoot,
      runImport: async (args) => {
        calls.push([...args]);
        if (isDryRun(args)) return;
        const out = outArgument(args);
        expect(await readdir(out)).toEqual([]);
        await writeFile(path.join(out, 'new.mdx'), 'new');
      },
    });

    const writes = calls.filter((args) => !isDryRun(args));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(
      expect.arrayContaining(['--status', 'published']),
    );
    const staging = outArgument(writes[0] ?? []);
    expect(path.relative(path.join(contentRoot, 'questions'), staging)).toMatch(
      /^\.\./,
    );
    expect(await readdir(importedRoot)).toEqual(['new.mdx']);
    expect(await readdir(contentRoot)).toEqual(['questions']);
  });

  it('leaves the current imported tree untouched when the import fails midway', async () => {
    await writeImported('current.mdx', 'current');

    await expect(
      prepareSeedCorpus({
        contentRoot,
        runImport: async (args) => {
          if (isDryRun(args)) return;
          await writeFile(path.join(outArgument(args), 'partial.mdx'), 'x');
          throw new Error('import failed');
        },
      }),
    ).rejects.toThrow('import failed');

    expect(await readdir(importedRoot)).toEqual(['current.mdx']);
    expect(await readFile(path.join(importedRoot, 'current.mdx'), 'utf8')).toBe(
      'current',
    );
    expect(await readdir(contentRoot)).toEqual(['questions']);
  });

  it('creates the imported tree when none exists yet', async () => {
    await prepareSeedCorpus({
      contentRoot,
      runImport: async (args) => {
        if (isDryRun(args)) return;
        await writeFile(path.join(outArgument(args), 'first.mdx'), 'first');
      },
    });

    expect(await readdir(importedRoot)).toEqual(['first.mdx']);
  });

  it('keeps the current tree when it cannot be moved aside', async () => {
    await writeImported('current.mdx', 'current');
    const questionsRoot = path.join(contentRoot, 'questions');
    // A read-only parent refuses the rename that parks the current tree.
    await chmod(questionsRoot, 0o500);
    try {
      await expect(
        prepareSeedCorpus({
          contentRoot,
          runImport: async (args) => {
            if (isDryRun(args)) return;
            await writeFile(path.join(outArgument(args), 'new.mdx'), 'new');
          },
        }),
      ).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      await chmod(questionsRoot, 0o755);
    }

    expect(await readdir(importedRoot)).toEqual(['current.mdx']);
    expect(await readdir(contentRoot)).toEqual(['questions']);
  });

  it('leaves no tree or temporary directory when a first import cannot be placed', async () => {
    await expect(
      prepareSeedCorpus({
        contentRoot,
        runImport: async (args) => {
          if (isDryRun(args)) return;
          await rm(outArgument(args), { recursive: true, force: true });
        },
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    expect(existsSync(importedRoot)).toBe(false);
    expect(await readdir(contentRoot)).toEqual(['questions']);
  });

  // #1153 review: if the restoring rename also fails, the parked tree is the
  // only copy of the current corpus, so it must survive for manual recovery.
  it('keeps the parked tree and names it when restoring it also fails', async () => {
    await writeImported('current.mdx', 'current');
    const renameUnlessPlacing = async (from: string, to: string) => {
      if (to === importedRoot)
        throw Object.assign(new Error('rename failed'), { code: 'EIO' });
      await rename(from, to);
    };

    const failure = await prepareSeedCorpus({
      contentRoot,
      rename: renameUnlessPlacing,
      runImport: async (args) => {
        if (isDryRun(args)) return;
        await writeFile(path.join(outArgument(args), 'new.mdx'), 'new');
      },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    const parkedRoot = (await readdir(contentRoot)).find((entry) =>
      entry.startsWith('.import-previous-'),
    );
    expect(parkedRoot).toBeDefined();
    const parked = path.join(contentRoot, String(parkedRoot), 'imported');
    expect(await readFile(path.join(parked, 'current.mdx'), 'utf8')).toBe(
      'current',
    );
    expect((failure as Error).message).toContain(parked);
    expect(existsSync(importedRoot)).toBe(false);
  });

  it('restores the current tree when the new tree cannot be moved into place', async () => {
    await writeImported('current.mdx', 'current');

    await expect(
      prepareSeedCorpus({
        contentRoot,
        runImport: async (args) => {
          if (isDryRun(args)) return;
          // Removing the staging directory makes the final rename fail.
          await rm(outArgument(args), { recursive: true, force: true });
        },
      }),
    ).rejects.toThrow();

    expect(await readdir(importedRoot)).toEqual(['current.mdx']);
    expect(existsSync(path.join(contentRoot, 'questions', 'imported'))).toBe(
      true,
    );
    expect(await readdir(contentRoot)).toEqual(['questions']);
  });
});
