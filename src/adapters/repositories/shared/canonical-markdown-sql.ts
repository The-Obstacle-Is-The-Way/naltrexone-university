import { type SQL, sql } from 'drizzle-orm';

// PostgreSQL's default trim removes only ASCII spaces. Match JavaScript
// String.trim() exactly, including its line terminators and BOM. The shared
// normalization vectors exercise every character through the score reader.
const ECMASCRIPT_TRIM_CHARACTERS =
  '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680' +
  '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a' +
  '\u2028\u2029\u202f\u205f\u3000\ufeff';

/** SQL twin of the domain's canonicalizeMarkdown; no stored field changes. */
export function canonicalMarkdownSql(text: SQL): SQL {
  const newlines = sql`regexp_replace(${text}, ${'\r\n?'}, ${'\n'}, 'g')`;
  const lines = sql`regexp_replace(${newlines}, ${'[ \t]+$'}, '', 'gn')`;
  return sql`btrim(${lines}, ${ECMASCRIPT_TRIM_CHARACTERS})`;
}
