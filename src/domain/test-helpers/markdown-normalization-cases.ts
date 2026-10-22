// Independent vectors for the seed's existing Markdown normalization. These
// also run through the domain key comparison and the real SQL score reader.
const edgeWhitespace = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680, 0x2000,
  0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
  0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
];

export const markdownNormalizationCases = [
  { name: 'CRLF lines', raw: 'first\r\nsecond', canonical: 'first\nsecond' },
  { name: 'CR lines', raw: 'first\rsecond', canonical: 'first\nsecond' },
  {
    name: 'trailing spaces and tabs on every line',
    raw: 'first \t\r\n \t\r\nsecond\t \r\n',
    canonical: 'first\n\nsecond',
  },
  ...edgeWhitespace.map((codePoint) => ({
    name: `edge whitespace U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
    raw: `${String.fromCodePoint(codePoint)}text${String.fromCodePoint(codePoint)}`,
    canonical: 'text',
  })),
] as const;

export const significantMarkdownCases = [
  { name: 'interior spacing', raw: 'first  second', canonical: 'first second' },
  {
    name: 'paragraph break',
    raw: 'first\n\nsecond',
    canonical: 'first\nsecond',
  },
  {
    name: 'interior indentation',
    raw: 'first\n  second',
    canonical: 'first\nsecond',
  },
  {
    name: 'non-ASCII space before a line end',
    raw: 'first\u00a0\nsecond',
    canonical: 'first\nsecond',
  },
  { name: 'next-line character', raw: '\u0085text\u0085', canonical: 'text' },
  {
    name: 'Mongolian vowel separator',
    raw: '\u180etext\u180e',
    canonical: 'text',
  },
  { name: 'zero-width space', raw: '\u200btext\u200b', canonical: 'text' },
] as const;
