import { createHash } from 'node:crypto';

export function normalizeNewlines(input: string): string {
  return input.replace(/\r\n?/g, '\n');
}

export function trimTrailingWhitespacePerLine(input: string): string {
  return normalizeNewlines(input)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
}

export function canonicalizeMarkdown(input: string): string {
  return trimTrailingWhitespacePerLine(input).trim();
}

export function extractBetween(
  content: string,
  startHeading: string,
  endHeading: string,
): string {
  const normalized = trimTrailingWhitespacePerLine(content);
  const lines = normalized.split('\n');

  const startIndex = lines.findIndex((line) => line === startHeading);
  const endIndex = lines.findIndex((line) => line === endHeading);

  if (startIndex === -1) {
    throw new Error(`Missing required heading: ${startHeading}`);
  }
  if (endIndex === -1) {
    throw new Error(`Missing required heading: ${endHeading}`);
  }
  if (endIndex <= startIndex) {
    throw new Error(
      `Invalid heading order: expected ${startHeading} before ${endHeading}`,
    );
  }

  return canonicalizeMarkdown(lines.slice(startIndex + 1, endIndex).join('\n'));
}

export function extractAfter(content: string, heading: string): string {
  const normalized = trimTrailingWhitespacePerLine(content);
  const lines = normalized.split('\n');

  const index = lines.findIndex((line) => line === heading);
  if (index === -1) {
    throw new Error(`Missing required heading: ${heading}`);
  }

  return canonicalizeMarkdown(lines.slice(index + 1).join('\n'));
}

export function parseMdxQuestionBody(content: string): {
  stemMd: string;
  explanationMd: string;
} {
  const stemMd = extractBetween(content, '## Stem', '## Explanation');
  const explanationMd = extractAfter(content, '## Explanation');

  if (!stemMd) {
    throw new Error('Stem markdown is empty after parsing');
  }
  if (!explanationMd) {
    throw new Error('Explanation markdown is empty after parsing');
  }

  return { stemMd, explanationMd };
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = canonicalizeJsonValue(record[key]);
    }
    return out;
  }

  if (typeof value === 'string') {
    return trimTrailingWhitespacePerLine(value);
  }

  return value;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

