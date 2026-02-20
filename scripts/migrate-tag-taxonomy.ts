import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { parseMdxQuestionBody } from '../lib/content/parseMdxQuestion';
import { migrateQuestionTags } from './migrate-tag-taxonomy/tag-migration-logic';
import {
  parseChoiceTexts,
  parseTags,
  tagsSignature,
} from './migrate-tag-taxonomy/tag-parsers';
import type {
  CliArgs,
  MigrationReport,
  MigrationTag,
  ReportMode,
} from './migrate-tag-taxonomy/types';

export { migrateQuestionTags } from './migrate-tag-taxonomy/tag-migration-logic';
export type {
  CanonicalKind,
  CliArgs,
  MigrationFailure,
  MigrationInput,
  MigrationReport,
  MigrationTag,
  ReportMode,
} from './migrate-tag-taxonomy/types';

function emptyTagCounts(): Record<string, number> {
  return {
    topic: 0,
    substance: 0,
    treatment: 0,
    diagnosis: 0,
    domain: 0,
  };
}

function incrementTagCounts(
  counts: Record<string, number>,
  tags: readonly MigrationTag[],
): void {
  for (const tag of tags) {
    counts[tag.kind] = (counts[tag.kind] ?? 0) + 1;
  }
}

export function parseCliArgs(argv: string[]): CliArgs {
  let mode: ReportMode = 'dry-run';
  let reportPath: string | null = null;

  const args = [...argv];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      mode = 'dry-run';
      continue;
    }

    if (arg === '--write') {
      mode = 'write';
      continue;
    }

    if (arg === '--report') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --report');
      }
      reportPath = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { mode, reportPath };
}

export async function runMigration(args: CliArgs): Promise<MigrationReport> {
  const files = await fg(['content/questions/**/*.mdx'], {
    onlyFiles: true,
    unique: true,
    absolute: true,
    dot: false,
  });

  const report: MigrationReport = {
    mode: args.mode,
    scannedFiles: files.length,
    changedFiles: 0,
    unchangedFiles: 0,
    writtenFiles: 0,
    failedFiles: 0,
    tagCountsByKind: emptyTagCounts(),
    failures: [],
  };

  for (const absoluteFilePath of files) {
    const filePath = path.relative(process.cwd(), absoluteFilePath);
    try {
      const raw = await readFile(absoluteFilePath, 'utf8');
      const { data, content } = matter(raw);
      const parsed = parseMdxQuestionBody(content);

      const tags = parseTags(data.tags, filePath);
      const migratedTags = migrateQuestionTags({
        filePath,
        stemMd: parsed.stemMd,
        explanationMd: parsed.explanationMd,
        choices: parseChoiceTexts(data.choices),
        tags,
      });
      incrementTagCounts(report.tagCountsByKind, migratedTags);

      // Intentionally order-sensitive compare: tag-order changes in frontmatter
      // are treated as file changes.
      const changed = tagsSignature(tags) !== tagsSignature(migratedTags);
      if (changed) {
        report.changedFiles += 1;
      } else {
        report.unchangedFiles += 1;
      }

      if (args.mode === 'write' && changed) {
        const updatedRaw = matter.stringify(content, {
          ...data,
          tags: migratedTags,
        });
        await writeFile(absoluteFilePath, updatedRaw, 'utf8');
        report.writtenFiles += 1;
      }
    } catch (error) {
      report.failedFiles += 1;
      const message = error instanceof Error ? error.message : String(error);
      report.failures.push({ filePath, message });
    }
  }

  if (args.reportPath) {
    await writeFile(args.reportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  return report;
}

export async function runMigrationCli(
  argv: string[],
): Promise<MigrationReport> {
  const args = parseCliArgs(argv);
  return runMigration(args);
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runMigrationCli(process.argv.slice(2))
    .then((report) => {
      console.info(`Mode: ${report.mode}`);
      console.info(`Scanned files: ${report.scannedFiles}`);
      console.info(`Changed files: ${report.changedFiles}`);
      console.info(`Unchanged files: ${report.unchangedFiles}`);
      console.info(`Written files: ${report.writtenFiles}`);
      console.info(`Failed files: ${report.failedFiles}`);
      if (report.failures.length > 0) {
        console.info('Failures:');
        for (const failure of report.failures) {
          console.info(`  - ${failure.filePath}: ${failure.message}`);
        }
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
