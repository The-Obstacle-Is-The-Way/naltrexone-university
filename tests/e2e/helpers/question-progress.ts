export function parseQuestionProgressCount(progressText: string): number {
  const normalized = progressText.trim();
  const match = normalized.match(/^Question \d+ of (\d+)\b/);
  if (!match) {
    throw new Error(
      `Could not parse question progress count from "${progressText}"`,
    );
  }

  return Number.parseInt(match[1], 10);
}
