import { mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export type SeedCorpusImport = (args: readonly string[]) => Promise<void>;
export type SeedCorpusRename = (from: string, to: string) => Promise<void>;

// DEBT-483: the managed seed used to delete content/questions/imported before
// regenerating it, so a failed import left no tree or a partial one. It now
// imports into fresh staging beside content/questions/ (on the same
// filesystem, outside the seed glob) and swaps the result in only after the
// whole import succeeds. The importer runs its full preflight before writing.
export async function prepareSeedCorpus(input: {
  contentRoot: string;
  runImport: SeedCorpusImport;
  // Injected only to force the double-failure path; defaults to fs.rename.
  rename?: SeedCorpusRename;
}): Promise<void> {
  const move = input.rename ?? rename;
  const importedRoot = path.join(input.contentRoot, 'questions', 'imported');
  const staging = await mkdtemp(
    path.join(input.contentRoot, '.import-staging-'),
  );
  try {
    await input.runImport(['--status', 'published', '--out', staging]);
    await swapInto(staging, importedRoot, input.contentRoot, move);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function swapInto(
  next: string,
  current: string,
  contentRoot: string,
  move: SeedCorpusRename,
): Promise<void> {
  const previous = await mkdtemp(path.join(contentRoot, '.import-previous-'));
  const parked = path.join(previous, 'imported');
  // True only when the parked tree is the last copy of the current corpus.
  let stranded = false;
  try {
    const hadCurrent = await moveIfPresent(current, parked, move);
    try {
      await move(next, current);
    } catch (error) {
      if (hadCurrent) {
        try {
          await move(parked, current);
        } catch {
          stranded = true;
          throw new Error(
            `Seed corpus swap failed and the previous tree could not be restored; it is preserved at ${parked}.`,
            { cause: error },
          );
        }
      }
      throw error;
    }
  } finally {
    if (!stranded) await rm(previous, { recursive: true, force: true });
  }
}

async function moveIfPresent(
  from: string,
  to: string,
  move: SeedCorpusRename,
): Promise<boolean> {
  try {
    await move(from, to);
    return true;
  } catch (error) {
    // Node's fs rejections are ErrnoExceptions; only a missing tree is benign.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
