import { mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export type SeedCorpusImport = (args: readonly string[]) => Promise<void>;

// DEBT-483: the managed seed used to delete content/questions/imported before
// regenerating it, so a failed import left no tree or a partial one. It now
// imports into fresh staging beside content/questions/ (on the same
// filesystem, outside the seed glob) and swaps the result in only after the
// whole import succeeds. The importer runs its full preflight before writing.
export async function prepareSeedCorpus(input: {
  contentRoot: string;
  runImport: SeedCorpusImport;
}): Promise<void> {
  const importedRoot = path.join(input.contentRoot, 'questions', 'imported');
  const staging = await mkdtemp(
    path.join(input.contentRoot, '.import-staging-'),
  );
  try {
    await input.runImport(['--status', 'published', '--out', staging]);
    await swapInto(staging, importedRoot, input.contentRoot);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function swapInto(
  next: string,
  current: string,
  contentRoot: string,
): Promise<void> {
  const previous = await mkdtemp(path.join(contentRoot, '.import-previous-'));
  const parked = path.join(previous, 'imported');
  try {
    const hadCurrent = await moveIfPresent(current, parked);
    try {
      await rename(next, current);
    } catch (error) {
      if (hadCurrent) await rename(parked, current);
      throw error;
    }
  } finally {
    await rm(previous, { recursive: true, force: true });
  }
}

async function moveIfPresent(from: string, to: string): Promise<boolean> {
  try {
    await rename(from, to);
    return true;
  } catch (error) {
    // Node's fs rejections are ErrnoExceptions; only a missing tree is benign.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
