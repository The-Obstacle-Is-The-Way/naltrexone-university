import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
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
  let inRoot = 'content/drafts/questions';
  let outRoot = 'content/questions/imported';
  let status: ImportStatus = 'draft';
  let dryRun = false;
  const seen = new Set<string>();
  // pnpm 11 forwards its leading separator. No separator is valid midway.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (
      flag !== '--in' &&
      flag !== '--out' &&
      flag !== '--status' &&
      flag !== '--dry-run'
    ) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    seen.add(flag);
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for flag: ${flag}`);
    if (flag === '--in') inRoot = value;
    else if (flag === '--out') outRoot = value;
    else if (value === 'draft' || value === 'published' || value === 'archived')
      status = value;
    else throw new Error(`Invalid --status: ${value}`);
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

async function assertEmptyOutputRoot(outRoot: string): Promise<void> {
  try {
    if ((await readdir(outRoot)).length > 0) {
      throw new Error(
        `Output root is not empty: ${path.resolve(outRoot)}. Use --out with a fresh staging directory; existing files were not changed.`,
      );
    }
  } catch (error) {
    if (
      !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    ) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const { inRoot, outRoot, status, dryRun } = parseArgs(process.argv.slice(2));

  const files = await glob(['**/recall.md', '**/vignettes.md'], {
    cwd: inRoot,
    onlyFiles: true,
    absolute: true,
    dot: false,
    expandDirectories: false,
  });

  if (files.length === 0) {
    throw new Error(`No recall.md/vignettes.md found under: ${inRoot}`);
  }

  let written = 0;
  const outputs: { file: string; mdx: string }[] = [];
  const qidLocations = new Map<string, string>();

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

    for (const [index, block] of blocks.entries()) {
      const draft = parseDraftQuestionBlock(block);
      const mdx = convertDraftQuestionToMdx({
        draft,
        status,
      });

      const qid = draft.frontmatter.qid;
      const location = `${file} (block ${index + 1})`;
      const previous = qidLocations.get(qid);
      if (previous !== undefined) {
        throw new Error(`Duplicate QID "${qid}": ${previous} and ${location}`);
      }
      qidLocations.set(qid, location);

      const outFile = draftQuestionOutputPath(
        outRoot,
        outputGroup,
        draft.frontmatter.source,
        qid,
      );
      await assertNoOutputSymlinks(outRoot, outFile);
      outputs.push({ file: outFile, mdx });
    }
  }

  if (!dryRun) {
    await assertEmptyOutputRoot(outRoot);
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
    `Imported draft questions: files=${files.length} questions=${outputs.length} written=${written}${suffix} uniqueQids=${qidLocations.size}`,
  );
  console.info(`Output root: ${path.resolve(outRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
