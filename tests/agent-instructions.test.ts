import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// The files agents load as instructions (ADR-023). Codex reads AGENTS.md up to
// 32 KiB by default, Claude Code reads it only through CLAUDE.md's import, and
// CodeRabbit applies a guideline file only to its own folder unless an
// `applyTo` mapping says otherwise. These tests keep all three reading the
// same rules, and keep the rules free of history.

const RULES_DIRECTORY = '.claude/rules';
// Half of Codex's default `project_doc_max_bytes`, leaving room for nested
// AGENTS.md files, which share that budget.
const AGENTS_BUDGET_BYTES = 16 * 1024;
const RECORD_ID = /\b(?:BUG|DEBT|FE)-\d+\b/;
const ISO_DATE = /\b20\d{2}-\d{2}-\d{2}\b/;

const read = (file: string) => readFileSync(file, 'utf8');
const ruleFiles = readdirSync(RULES_DIRECTORY)
  .filter((name) => name.endsWith('.md'))
  .map((name) => path.posix.join(RULES_DIRECTORY, name))
  .sort();

function rulePaths(file: string): string[] {
  const frontMatter = read(file).match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontMatter?.[1]) return [];
  const paths = (parse(frontMatter[1]) as { paths?: unknown }).paths;
  return Array.isArray(paths) ? paths.map(String) : [];
}

type GuidelinePattern = string | { files: string; applyTo?: string };

function guidelineMappings(): Map<string, string[]> {
  const config = parse(read('.coderabbit.yaml')) as {
    knowledge_base?: {
      code_guidelines?: { filePatterns?: GuidelinePattern[] };
    };
  };
  const mappings = new Map<string, string[]>();
  for (const pattern of config.knowledge_base?.code_guidelines?.filePatterns ??
    []) {
    if (typeof pattern === 'string' || pattern.applyTo === undefined) continue;
    // `{a,b}` brace groups list several globs in one applyTo.
    const globs = pattern.applyTo.match(/^\{(.*)\}$/)?.[1]?.split(',') ?? [
      pattern.applyTo,
    ];
    mappings.set(pattern.files, globs.sort());
  }
  return mappings;
}

function codexMappings(): Map<string, string[]> {
  const mappings = new Map<string, string[]>();
  const table =
    read('AGENTS.md')
      .split('## Rules for Particular Files\n')[1]
      ?.split('\n## ')[0] ?? '';
  for (const row of table.split('\n').filter((line) => line.startsWith('|'))) {
    const cells = row.split('|');
    const patterns = [...(cells[1] ?? '').matchAll(/`([^`]+)`/g)].map(
      (match) => match[1] ?? '',
    );
    const rules = [...(cells[2] ?? '').matchAll(/`([^`]+\.md)`/g)].map(
      (match) => match[1] ?? '',
    );
    for (const rule of rules) mappings.set(rule, patterns.toSorted());
  }
  return mappings;
}

describe('agent instructions', () => {
  it('keeps AGENTS.md within half of Codex default read budget', () => {
    expect(Buffer.byteLength(read('AGENTS.md'), 'utf8')).toBeLessThanOrEqual(
      AGENTS_BUDGET_BYTES,
    );
  });

  it('imports AGENTS.md into every Claude Code session', () => {
    expect(read('CLAUDE.md').split('\n')).toContain('@AGENTS.md');
  });

  it.each(['AGENTS.md', 'CLAUDE.md', ...ruleFiles])(
    'keeps record IDs and dates out of %s',
    (file) => {
      const contents = read(file);
      expect(contents.match(RECORD_ID)?.[0]).toBeUndefined();
      expect(contents.match(ISO_DATE)?.[0]).toBeUndefined();
    },
  );

  it.each(ruleFiles)('names %s in AGENTS.md, for Codex', (file) => {
    expect(read('AGENTS.md')).toContain(file);
  });

  it.each(ruleFiles)(
    'routes Codex to %s for the same paths as Claude Code',
    (file) => {
      const paths = rulePaths(file);
      expect(codexMappings().get(file)).toEqual(
        paths.length > 0 ? paths.toSorted() : ['**/*'],
      );
    },
  );

  it.each(ruleFiles)(
    'maps %s for CodeRabbit to the same paths Claude Code loads it for',
    (file) => {
      const paths = rulePaths(file);
      expect(guidelineMappings().get(file)).toEqual(
        paths.length > 0 ? [...paths].sort() : ['**/*'],
      );
    },
  );
});
