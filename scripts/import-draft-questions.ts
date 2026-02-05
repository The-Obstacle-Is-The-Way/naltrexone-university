import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import {
  convertDraftQuestionToMdx,
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

function domainFromPath(inRoot: string, filePath: string): string | undefined {
  const relative = path.relative(inRoot, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  const first = parts.at(0);
  if (!first) return undefined;
  if (first.endsWith('.md')) return undefined;
  return first;
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
  let questions = 0;

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const blocks = splitDraftQuestionsFile(raw);
    const domainTagSlug = domainFromPath(inRoot, file) ?? 'misc';

    for (const block of blocks) {
      const draft = parseDraftQuestionBlock(block);
      const mdx = convertDraftQuestionToMdx({
        draft,
        status,
        domainTagSlug,
      });

      const outDir = path.join(
        outRoot,
        domainTagSlug,
        draft.frontmatter.source,
      );
      const outFile = path.join(outDir, `${draft.frontmatter.qid}.mdx`);

      if (!dryRun) {
        await mkdir(outDir, { recursive: true });
        await writeFile(outFile, mdx, 'utf8');
        written += 1;
      }

      questions += 1;
    }
  }

  const suffix = dryRun ? ' (dry-run)' : '';
  console.info(
    `Imported draft questions: files=${files.length} questions=${questions} written=${written}${suffix}`,
  );
  console.info(`Output root: ${path.resolve(outRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
