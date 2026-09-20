import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import {
  convertDraftQuestionToMdx,
  draftQuestionOutputPath,
  parseDraftQuestionBlock,
  splitDraftQuestionsFile,
} from './draft-question-import';

type ImportStatus = 'draft' | 'published' | 'archived';

function parseArgs(argv: string[]): {
  inRoot: string;
  outRoot: string;
  status: ImportStatus;
  dryRun: boolean;
} {
  const defaults = {
    inRoot: 'content/drafts/questions',
    outRoot: 'content/questions/imported',
    status: 'draft' as const,
    dryRun: false,
  };

  const args = [...argv];
  const nextValue = (flag: string): string => {
    const index = args.indexOf(flag);
    if (index === -1) {
      throw new Error(`Missing required flag: ${flag}`);
    }
    const value = args[index + 1];
    if (!value) {
      throw new Error(`Missing value for flag: ${flag}`);
    }
    return value;
  };

  const inRoot = args.includes('--in') ? nextValue('--in') : defaults.inRoot;
  const outRoot = args.includes('--out')
    ? nextValue('--out')
    : defaults.outRoot;
  const status = (
    args.includes('--status') ? nextValue('--status') : defaults.status
  ) as ImportStatus;
  const dryRun = args.includes('--dry-run') ? true : defaults.dryRun;

  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error(`Invalid --status: ${status}`);
  }

  return { inRoot, outRoot, status, dryRun };
}

function outputGroupFromPath(
  inRoot: string,
  filePath: string,
): string | undefined {
  const relative = path.relative(inRoot, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  const first = parts.at(0);
  if (!first) return undefined;
  if (first.endsWith('.md')) return undefined;
  return first;
}

async function assertNoOutputSymlinks(
  outRoot: string,
  outFile: string,
): Promise<void> {
  const root = path.resolve(outRoot);
  // outFile has already passed lexical containment. Check the root itself and
  // every existing component below it, including a symlinked destination file.
  for (let entry = outFile; ; entry = path.dirname(entry)) {
    try {
      if ((await lstat(entry)).isSymbolicLink()) {
        throw new Error(`Draft output contains a symlink: ${entry}`);
      }
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      ) {
        throw error;
      }
    }
    if (entry === root) return;
  }
}

async function main(): Promise<void> {
  const { inRoot, outRoot, status, dryRun } = parseArgs(process.argv.slice(2));

  const files = await fg(['**/recall.md', '**/vignettes.md'], {
    cwd: inRoot,
    onlyFiles: true,
    unique: true,
    absolute: true,
    dot: false,
  });

  if (files.length === 0) {
    throw new Error(`No recall.md/vignettes.md found under: ${inRoot}`);
  }

  let written = 0;
  const outputs: { file: string; mdx: string }[] = [];

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    let blocks: string[];
    try {
      blocks = splitDraftQuestionsFile(raw);
    } catch (error) {
      throw new Error(`Invalid draft file ${file}: ${String(error)}`, {
        cause: error,
      });
    }
    const outputGroup = outputGroupFromPath(inRoot, file) ?? 'misc';

    for (const block of blocks) {
      const draft = parseDraftQuestionBlock(block);
      const mdx = convertDraftQuestionToMdx({
        draft,
        status,
      });

      const outFile = draftQuestionOutputPath(
        outRoot,
        outputGroup,
        draft.frontmatter.source,
        draft.frontmatter.qid,
      );
      await assertNoOutputSymlinks(outRoot, outFile);
      outputs.push({ file: outFile, mdx });
    }
  }

  if (!dryRun) {
    for (const output of outputs) {
      await assertNoOutputSymlinks(outRoot, output.file);
      await mkdir(path.dirname(output.file), { recursive: true });
      await assertNoOutputSymlinks(outRoot, output.file);
      await writeFile(output.file, output.mdx, 'utf8');
      written += 1;
    }
  }

  const suffix = dryRun ? ' (dry-run)' : '';
  console.info(
    `Imported draft questions: files=${files.length} questions=${outputs.length} written=${written}${suffix}`,
  );
  console.info(`Output root: ${path.resolve(outRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
