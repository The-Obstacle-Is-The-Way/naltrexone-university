import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CodeRabbit's markdownlint check (MD022) wants a blank line on each side of a
// heading, and three review cycles went to it on 2026-10-05 and 2026-10-06.
// Live Markdown keeps the rule; archived records stay as they were written.
function headingsWithoutBlankLines(source: string): number[] {
  const lines = source.split('\n');
  const flagged: number[] = [];
  // A fence closes only on its own character, at least as long, with nothing
  // after it (CommonMark), so a fenced example of a shorter fence stays in.
  let fence: { char: string; length: number } | null = null;
  lines.forEach((line, index) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      const run = marker[1] ?? '';
      if (!fence) {
        fence = { char: run[0] ?? '`', length: run.length };
        return;
      }
      if (
        run[0] === fence.char &&
        run.length >= fence.length &&
        (marker[2] ?? '').trim() === ''
      ) {
        fence = null;
        return;
      }
    }
    // CommonMark ATX heading: up to three spaces, one to six hashes, then a
    // space or the end of the line.
    if (fence || !/^ {0,3}#{1,6}(\s|$)/.test(line)) return;
    const textBefore = index > 0 && lines[index - 1]?.trim() !== '';
    const textAfter =
      index + 1 < lines.length && lines[index + 1]?.trim() !== '';
    if (textBefore || textAfter) flagged.push(index + 1);
  });
  return flagged;
}

const LIVE_MARKDOWN = [
  ...globSync('docs/**/*.md').filter(
    (file) => !file.startsWith('docs/_archive/'),
  ),
  ...globSync('*.md'),
  ...globSync('.claude/rules/*.md'),
  ...globSync('.github/**/*.md'),
].sort();

describe('headingsWithoutBlankLines', () => {
  it('accepts headings with a blank line on each side, or at the file edges', () => {
    expect(
      headingsWithoutBlankLines(
        '# Title\n\nText.\n\n## Part\n\nMore.\n\n## End',
      ),
    ).toEqual([]);
  });

  it('flags a heading with text right after or right before it', () => {
    expect(headingsWithoutBlankLines('# Title\nText.\n\n## Part\n')).toEqual([
      1,
    ]);
    expect(headingsWithoutBlankLines('Text.\n## Part\n\nMore.')).toEqual([2]);
  });

  // CommonMark allows up to three spaces before a heading, and a heading with
  // no text; a hash with no space after it is not a heading.
  it('recognizes an indented heading and an empty one, but not #123', () => {
    expect(headingsWithoutBlankLines('Text.\n   ## Indented\n\nMore.')).toEqual(
      [2],
    );
    expect(headingsWithoutBlankLines('Text.\n##\nMore.')).toEqual([2]);
    expect(headingsWithoutBlankLines('See\n#123\nfor details.')).toEqual([]);
  });

  // A fence closes only on its own character, at least as long, with nothing
  // after it, so a fenced example of a shorter fence stays inside it.
  it('keeps a longer fence open across a shorter fence inside it', () => {
    expect(
      headingsWithoutBlankLines(
        '````md\n```\n# example heading\n```\n````\n\nText.\n# Live heading\nMore.',
      ),
    ).toEqual([8]);
  });

  it('ignores a hash inside a code fence, and one not followed by a space', () => {
    expect(
      headingsWithoutBlankLines(
        '```bash\n# a comment\necho\n```\n\n#hashtag\nText.',
      ),
    ).toEqual([]);
  });
});

describe('live Markdown headings', () => {
  it('finds the live Markdown', () => {
    expect(LIVE_MARKDOWN.length).toBeGreaterThan(100);
  });

  it('has a blank line on each side of every heading', () => {
    expect(
      LIVE_MARKDOWN.flatMap((file) =>
        headingsWithoutBlankLines(readFileSync(file, 'utf8')).map(
          (line) => `${file}:${line}`,
        ),
      ),
    ).toEqual([]);
  });
});
