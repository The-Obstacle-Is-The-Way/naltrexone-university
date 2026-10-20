import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseQuestionFeedbackExportArgs } from '../scripts/feedback/export-question-feedback';

// These parsers reject a literal separator. pnpm forwards it after a script
// name; unlike npm, it is not needed to forward flags. Scope this guard to
// those operator commands, not commands whose own CLI accepts a separator.
const STRICT_OPERATOR_COMMANDS = [
  'export:feedback',
  'db:seed:all',
  'db:seed:prod',
  'content:import:drafts',
  'content:release:bootstrap',
  'content:release:stage',
  'content:release:activate',
  'content:hold',
  'content:withdraw',
  'content:keys:compare',
  'content:census:key-returns',
  'content:census:normalization',
  'pr:merge-reviewed',
  'pr:verify-promotion',
  'record:next',
  'local:test:target',
  'notice:requeue',
  'db:verify-ledger',
  'docs:audit',
  'secret:check-header',
  'deps:verify-union',
];
const SEPARATOR_AFTER_STRICT_COMMAND = new RegExp(
  `\\bpnpm[ \\t]+(?:(?:run|--silent)[ \\t]+)*(?:${STRICT_OPERATOR_COMMANDS.join('|')})[ \\t]+\\[?--(?=[ \\t\\r\\n\\]])`,
  'g',
);
function invalidSeparators(source: string): string[] {
  return Array.from(
    source.matchAll(SEPARATOR_AFTER_STRICT_COMMAND),
    (match) => match[0],
  );
}

function operatorSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return operatorSourceFiles(file);
    return entry.isFile() &&
      /\.(?:md|ts|mts|json)$/.test(file) &&
      !/\.(?:test|spec)\.[cm]?tsx?$/.test(file)
      ? [file]
      : [];
  });
}

describe('pnpm operator command examples', () => {
  it.each([
    'pnpm --silent export:feedback -- --format json',
    'pnpm run --silent export:feedback -- --include-comments',
    'pnpm --silent run export:feedback -- --include-user-id',
    'pnpm db:seed:all -- --plan',
    'Usage: pnpm db:seed:prod [-- --plan]',
    'pnpm content:import:drafts -- --dry-run',
    'pnpm pr:merge-reviewed -- 1560',
  ])('detects a separator forwarded to a strict parser: %s', (source) => {
    expect(invalidSeparators(source)).toHaveLength(1);
  });

  it.each([
    'pnpm --silent export:feedback --format json',
    'pnpm db:seed:all [--plan]',
    'pnpm db:seed:prod --plan',
    'pnpm exec tool -- --flag',
    'pnpm test:e2e -- tests/e2e/smoke.spec.ts',
    'pnpm content:import:drafts --dry-run',
  ])('leaves direct flags and unrelated CLIs alone: %s', (source) => {
    expect(invalidSeparators(source)).toEqual([]);
  });

  it('keeps broken separators out of documentation, operator scripts and package scripts', () => {
    const files = [
      ...operatorSourceFiles('docs'),
      ...operatorSourceFiles('scripts'),
      'package.json',
    ];
    const violations = files.flatMap((file) =>
      invalidSeparators(readFileSync(file, 'utf8')).map(
        (command) => `${file}: ${command}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it('parses every feedback-export example with the actual argument parser', () => {
    const guide = readFileSync(
      'docs/guides/content/feedback-export.md',
      'utf8',
    );
    const commands = Array.from(
      guide.matchAll(/pnpm --silent export:feedback([^\n>]*)/g),
      (match) => match[1]?.trim().split(/\s+/).filter(Boolean) ?? [],
    );
    expect(commands).toHaveLength(4);
    expect(commands.map(parseQuestionFeedbackExportArgs)).toEqual([
      { format: 'csv', includeUserId: false, includeComments: false },
      { format: 'json', includeUserId: false, includeComments: false },
      { format: 'csv', includeUserId: true, includeComments: false },
      { format: 'csv', includeUserId: false, includeComments: true },
    ]);
  });
});
