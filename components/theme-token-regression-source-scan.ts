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

type CountedExemption = readonly [
  filePath: string,
  expectedCount: number,
  reason: string,
];

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
  /(?:^|:)(?:bg-muted|hover:bg-muted|divide-border|dark:divide-foreground|border-border|dark:border-foreground|bg-foreground|hover:bg-foreground|dark:hover:bg-foreground|dark:bg-foreground|text-foreground|hover:text-foreground|border-foreground|hover:border-foreground|dark:hover:border-foreground)-/;

export const RAW_BUTTON_EXEMPTIONS: readonly CountedExemption[] = [
  [
    'components/mobile-nav.tsx',
    1,
    'Pattern Registry I-6 app-shell disclosure toggle exception.',
  ],
  // TODO(DEBT-399): migrate to Button or add a dedicated registry pattern.
  [
    'app/(app)/app/shared/components/session-breakdown-list.tsx',
    1,
    'Temporary DEBT-399 raw-button cleanup site.',
  ],
  // TODO(DEBT-399): migrate to Button or add a dedicated registry pattern.
  [
    'app/(app)/app/history/components/history-sessions-tab.tsx',
    1,
    'Temporary DEBT-399 raw-button cleanup site.',
  ],
  // TODO(DEBT-399): migrate to Button or add a dedicated registry pattern.
  [
    'app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx',
    1,
    'Temporary DEBT-399 raw-button cleanup site.',
  ],
];

// Add new source-scan allowlist entries only when the Pattern Registry
// documents the pattern; TODO(DEBT-399) exemptions are temporary and must shrink.
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
]);

export const TEMPORARY_OPACITY_EXEMPTIONS: readonly OpacityExemption[] = [
  // TODO(DEBT-399): align session breakdown row hovers to Pattern Registry.
  [
    'app/(app)/app/shared/components/session-breakdown-list.tsx',
    'hover:bg-muted/20',
    2,
    'Temporary DEBT-399 hover opacity divergence.',
  ],
  // TODO(DEBT-399): align exam review row hover to Pattern Registry.
  [
    'app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx',
    'hover:bg-muted/20',
    1,
    'Temporary DEBT-399 hover opacity divergence.',
  ],
  // TODO(DEBT-399): align session breakdown divider to Pattern Registry.
  [
    'app/(app)/app/shared/components/session-breakdown-list.tsx',
    'divide-border/20',
    1,
    'Temporary DEBT-399 divider opacity divergence.',
  ],
  // TODO(DEBT-399): align session breakdown dark divider to Pattern Registry.
  [
    'app/(app)/app/shared/components/session-breakdown-list.tsx',
    'dark:divide-foreground/20',
    1,
    'Temporary DEBT-399 dark divider opacity divergence.',
  ],
  // TODO(DEBT-399): align history session panel border to Pattern Registry.
  [
    'app/(app)/app/history/components/history-sessions-tab.tsx',
    'border-border/30',
    1,
    'Temporary DEBT-399 border opacity divergence.',
  ],
  // TODO(DEBT-399): align history session dark panel border to Pattern Registry.
  [
    'app/(app)/app/history/components/history-sessions-tab.tsx',
    'dark:border-foreground/10',
    1,
    'Temporary DEBT-399 dark border opacity divergence.',
  ],
];

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

function countRawButtonSites(source: SourceFile): number[] {
  return source.lines.flatMap((line, index) =>
    Array.from(line.matchAll(RAW_BUTTON_PATTERN)).map(() => index + 1),
  );
}

export function collectRawButtonIssues(
  sources: readonly SourceFile[],
  options: {
    exemptions?: readonly CountedExemption[];
    enforceExemptionCounts?: boolean;
  } = {},
): string[] {
  const exemptions = options.exemptions ?? RAW_BUTTON_EXEMPTIONS;
  const allowedByFilePath = new Map(
    exemptions.map((exemption) => [exemption[0], exemption]),
  );
  const actualCountByFilePath = new Map<string, number>();
  const issues: string[] = [];

  for (const source of sources) {
    if (source.filePath.startsWith('components/ui/')) {
      continue;
    }

    const rawButtonLineNumbers = countRawButtonSites(source);
    if (rawButtonLineNumbers.length === 0) {
      continue;
    }

    actualCountByFilePath.set(source.filePath, rawButtonLineNumbers.length);
    if (allowedByFilePath.has(source.filePath)) {
      continue;
    }

    for (const lineNumber of rawButtonLineNumbers) {
      issues.push(
        `${source.filePath}:${lineNumber} raw <button> outside components/ui/ is not allowed by DEBT-398 PR 3. Use <Button> or add a documented Pattern Registry exception.`,
      );
    }
  }

  if (options.enforceExemptionCounts) {
    for (const [filePath, expectedCount, reason] of exemptions) {
      const actualCount = actualCountByFilePath.get(filePath) ?? 0;
      if (actualCount !== expectedCount) {
        issues.push(
          `${filePath} expected exactly ${expectedCount} exempt raw <button> occurrence(s), found ${actualCount}. ${reason}`,
        );
      }
    }
  }

  return issues;
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
