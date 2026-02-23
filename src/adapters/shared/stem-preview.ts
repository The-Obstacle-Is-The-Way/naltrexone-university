export function toPlainText(markdown: string): string {
  const withoutLinks = markdown.replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1');
  const withoutFormatting = withoutLinks.replace(/[`*_>#]/g, '');
  return withoutFormatting.replace(/\s+/g, ' ').trim();
}

/** Minimum fraction of the preview limit a sentence boundary must reach
 *  before we prefer it over a mid-word ellipsis truncation. */
const MIN_SENTENCE_BOUNDARY_RATIO = 0.6;

function findLastSentenceBoundary(text: string): number {
  const boundaryPattern = /[.!?](?=\s|$)/g;
  let lastBoundary = -1;

  for (const match of text.matchAll(boundaryPattern)) {
    const matchIndex = match.index;
    if (typeof matchIndex !== 'number') continue;
    lastBoundary = matchIndex + 1;
  }

  return lastBoundary;
}

export function getStemPreview(stemMd: string, maxLength: number): string {
  const plain = toPlainText(stemMd);
  if (plain.length <= maxLength) return plain;
  if (maxLength <= 3) return plain.slice(0, Math.max(0, maxLength));

  const previewLimit = maxLength - 3;
  const candidate = plain.slice(0, previewLimit).trimEnd();
  const sentenceBoundary = findLastSentenceBoundary(candidate);
  const minBoundaryLength = Math.floor(
    previewLimit * MIN_SENTENCE_BOUNDARY_RATIO,
  );

  if (sentenceBoundary >= minBoundaryLength) {
    return candidate.slice(0, sentenceBoundary).trimEnd();
  }

  return `${candidate}...`;
}
