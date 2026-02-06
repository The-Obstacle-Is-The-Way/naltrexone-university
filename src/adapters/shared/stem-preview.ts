export function toPlainText(markdown: string): string {
  const withoutLinks = markdown.replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1');
  const withoutFormatting = withoutLinks.replace(/[`*_>#]/g, '');
  return withoutFormatting.replace(/\s+/g, ' ').trim();
}

export function getStemPreview(stemMd: string, maxLength: number): string {
  const plain = toPlainText(stemMd);
  if (plain.length <= maxLength) return plain;
  if (maxLength <= 3) return plain.slice(0, Math.max(0, maxLength));
  return `${plain.slice(0, maxLength - 3).trimEnd()}...`;
}
