export function parseQuestionProgressCount(progressText: string): number {
  const normalized = progressText.trim();
  const countText = normalized.replace(/^Question \d+ of /, '');
  if (countText === normalized || !/^\d+\b/.test(countText)) {
    throw new Error(
      `Could not parse question progress count from "${progressText}"`,
    );
  }

  return Number.parseInt(countText, 10);
}
