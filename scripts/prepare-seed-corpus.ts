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
  let hadCurrent = true;
  try {
    await rename(current, parked);
  } catch (error) {
    if (!isMissing(error)) {
      await rm(previous, { recursive: true, force: true });
      throw error;
    }
    hadCurrent = false;
  }
  try {
    await rename(next, current);
  } catch (error) {
    if (hadCurrent) await rename(parked, current);
    await rm(previous, { recursive: true, force: true });
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
