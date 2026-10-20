export function normalizeNewlines(input: string): string {
  return input.replace(/\r\n?/g, '\n');
}

export function trimTrailingWhitespacePerLine(input: string): string {
  return normalizeNewlines(input)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
}

// The seed and answer-key comparisons share this normalization. It changes
// the comparison, never the immutable fields or hashes of stored revisions.
export function canonicalizeMarkdown(input: string): string {
  return trimTrailingWhitespacePerLine(input).trim();
}
