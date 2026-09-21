import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';

type SourceFile = {
  filePath: string;
  lines: readonly string[];
};

type OpacityOccurrence = {
  filePath: string;
  lineNumber: number;
  token: string;
};

type OpacityExemption = readonly [
  filePath: string,
  token: string,
  expectedCount: number,
  reason: string,
];

const PRODUCTION_UI_SOURCE_GLOBS = ['app/**/*.tsx', 'components/**/*.tsx'];
const PRODUCTION_UI_SOURCE_IGNORE_GLOBS = [
  '**/*.test.tsx',
  '**/*.browser.spec.tsx',
  '**/*test-helpers.tsx',
  '**/*.probes.tsx',
];

const RAW_BUTTON_PATTERN = /<button\b/g;
const OPACITY_TOKEN_PATTERN = /[^\s"'`<>]+\/(?:\[[^\]\s"'`<>]+\]|[0-9]+%?)/g;
const OPACITY_UTILITY_PATTERN =
  /(?:^|:)(?:bg|text|border|divide|ring|focus:bg|focus-visible:ring|focus-within:ring|aria-invalid:ring|hover:bg|hover:border|hover:text)-/;
const CONTROLLED_OPACITY_TOKEN_PATTERN =
  /(?:^|:)(?:bg-muted|hover:bg-muted|divide-border|dark:divide-foreground|border-border|dark:border-foreground|bg-foreground|hover:bg-foreground|dark:hover:bg-foreground|dark:bg-foreground|text-foreground|hover:text-foreground|border-foreground|hover:border-foreground|dark:hover:border-foreground)\//;

// Add new source-scan allowlist entries only when the Pattern Registry
// documents the pattern; temporary exemptions must shrink over time.
export const DOCUMENTED_OPACITY_TOKENS = new Set([
  'bg-muted/20',
  'hover:bg-muted/40',
  'hover:bg-muted/50',
  'bg-foreground/5',
  'bg-foreground/[0.06]',
  'bg-foreground/[0.07]',
  'bg-foreground/[0.08]',
  'hover:bg-foreground/[0.06]',
  'hover:bg-foreground/[0.08]',
  'hover:bg-foreground/[0.12]',
  'dark:hover:bg-foreground/[0.05]',
  'dark:bg-foreground/[0.12]',
  'dark:bg-foreground/10',
  'dark:bg-foreground/20',
  'text-foreground/60',
  'text-foreground/80',
  'hover:text-foreground/80',
  'border-foreground/20',
  'border-foreground/40',
  'border-foreground/50',
  'hover:border-foreground/55',
  'dark:border-foreground/40',
  'dark:border-foreground/60',
  'dark:border-foreground/70',
  'dark:hover:border-foreground/50',
  'dark:hover:border-foreground/70',
  'border-border/40',
  'border-border/60',
  'divide-border/40',
  'dark:divide-foreground/40',
]);

export const TEMPORARY_OPACITY_EXEMPTIONS: readonly OpacityExemption[] = [];

export function readProductionUiSources(): SourceFile[] {
  return fg
    .sync(PRODUCTION_UI_SOURCE_GLOBS, {
      cwd: process.cwd(),
      ignore: PRODUCTION_UI_SOURCE_IGNORE_GLOBS,
      onlyFiles: true,
    })
    .sort()
    .map((filePath) => ({
      filePath,
      lines: readFileSync(resolve(process.cwd(), filePath), 'utf-8').split(
        /\r?\n/,
      ),
    }));
}

// Biome enforces the general JSX ban. Its file-level exception cannot enforce
// the exact occurrence count required by Pattern Registry I-6, so retain that.
export function collectRawButtonExemptionIssues(
  sources: readonly SourceFile[],
): string[] {
  const filePath = 'components/mobile-nav.tsx';
  const source = sources.find((candidate) => candidate.filePath === filePath);
  const actualCount =
    source?.lines.flatMap((line) => [...line.matchAll(RAW_BUTTON_PATTERN)])
      .length ?? 0;
  return actualCount === 1
    ? []
    : [
        `${filePath} expected exactly 1 exempt raw <button> occurrence(s), found ${actualCount}. Pattern Registry I-6 app-shell disclosure toggle exception.`,
      ];
}

function extractOpacityOccurrences(source: SourceFile): OpacityOccurrence[] {
  return source.lines.flatMap((line, index) =>
    Array.from(line.matchAll(OPACITY_TOKEN_PATTERN))
      .map((match) => match[0])
      .filter((token) => OPACITY_UTILITY_PATTERN.test(token))
      .map((token) => ({
        filePath: source.filePath,
        lineNumber: index + 1,
        token,
      })),
  );
}

function isArbitraryOpacityToken(token: string): boolean {
  return /\/\[[^\]]+\]/.test(token) || /\/[0-9]+%$/.test(token);
}

function isTemporaryOpacityExemption(
  occurrence: OpacityOccurrence,
  exemptions: readonly OpacityExemption[],
): boolean {
  return exemptions.some(
    (exemption) =>
      exemption[0] === occurrence.filePath && exemption[1] === occurrence.token,
  );
}

function shouldEnforceOpacityToken(token: string): boolean {
  return (
    isArbitraryOpacityToken(token) ||
    CONTROLLED_OPACITY_TOKEN_PATTERN.test(token)
  );
}

export function collectOpacityIssues(
  sources: readonly SourceFile[],
  options: {
    temporaryExemptions?: readonly OpacityExemption[];
    enforceExemptionCounts?: boolean;
  } = {},
): string[] {
  const temporaryExemptions =
    options.temporaryExemptions ?? TEMPORARY_OPACITY_EXEMPTIONS;
  const occurrences = sources.flatMap(extractOpacityOccurrences);
  const issues: string[] = [];

  for (const occurrence of occurrences) {
    if (!shouldEnforceOpacityToken(occurrence.token)) {
      continue;
    }
    if (DOCUMENTED_OPACITY_TOKENS.has(occurrence.token)) {
      continue;
    }
    if (isTemporaryOpacityExemption(occurrence, temporaryExemptions)) {
      continue;
    }

    issues.push(
      `${occurrence.filePath}:${occurrence.lineNumber} undocumented opacity token "${occurrence.token}" is not in the Pattern Registry allowlist. Add the pattern to docs/frontend/pattern-registry.md before using it.`,
    );
  }

  if (options.enforceExemptionCounts) {
    for (const [
      filePath,
      token,
      expectedCount,
      reason,
    ] of temporaryExemptions) {
      const actualCount = occurrences.filter(
        (occurrence) =>
          occurrence.filePath === filePath && occurrence.token === token,
      ).length;
      if (actualCount !== expectedCount) {
        issues.push(
          `${filePath} expected exactly ${expectedCount} temporary "${token}" occurrence(s), found ${actualCount}. ${reason}`,
        );
      }
    }
  }

  return issues;
}
