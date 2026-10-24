import { describe, expect, it } from 'vitest';
import { hunksMovedOnlyByBase } from './diff-hunks';

// A PR patch of hunks, each a header at an old line plus `lines` old lines.
const patch = (...hunks: [start: number, lines: number][]) =>
  hunks
    .map(
      ([start, lines]) =>
        `@@ -${start},${lines} +${start},${lines} @@\n${' x\n'.repeat(lines).trimEnd()}`,
    )
    .join('\n');

describe('hunks moved only by the base', () => {
  it('keeps hunks in place when the base left the file alone', () => {
    expect(hunksMovedOnlyByBase(patch([10, 3]), patch([10, 3]), '')).toBe(true);
    expect(hunksMovedOnlyByBase(patch([10, 3]), patch([11, 3]), '')).toBe(
      false,
    );
  });

  it('moves a hunk down by lines the base inserted directly above it', () => {
    const insertedAboveLineTen = '@@ -7,3 +7,5 @@\n a\n b\n c\n+1\n+2';

    expect(
      hunksMovedOnlyByBase(
        patch([10, 3]),
        patch([12, 3]),
        insertedAboveLineTen,
      ),
    ).toBe(true);
  });

  it('moves a hunk up by lines the base removed above it', () => {
    const removedLinesTwoAndThree = '@@ -1,4 +1,2 @@\n a\n-b\n-c\n d';

    expect(
      hunksMovedOnlyByBase(
        patch([10, 3]),
        patch([8, 3]),
        removedLinesTwoAndThree,
      ),
    ).toBe(true);
  });

  it('counts each removed line when numbering the base’s later edits', () => {
    // Removes line 2, then inserts before line 5.
    const removedThenInserted = '@@ -1,5 +1,5 @@\n a\n-b\n c\n d\n+new\n e';

    expect(
      hunksMovedOnlyByBase(patch([4, 1]), patch([3, 1]), removedThenInserted),
    ).toBe(true);
  });

  it('separates base edits split by an unchanged line', () => {
    // Inserts before line 2 and, separately, before line 3.
    const twoInsertions = '@@ -1,3 +1,5 @@\n a\n+x\n b\n+y\n c';

    expect(
      hunksMovedOnlyByBase(patch([2, 1]), patch([3, 1]), twoInsertions),
    ).toBe(true);
  });

  it('places an insertion with no old lines after its start line', () => {
    const insertedAfterLineFive = '@@ -5,0 +6,2 @@\n+1\n+2';

    expect(
      hunksMovedOnlyByBase(patch([5, 1]), patch([5, 1]), insertedAfterLineFive),
    ).toBe(true);
    expect(
      hunksMovedOnlyByBase(patch([6, 1]), patch([8, 1]), insertedAfterLineFive),
    ).toBe(true);
  });

  it('refuses a base edit inside the lines a hunk covers', () => {
    const editedLineEleven = '@@ -10,2 +10,2 @@\n a\n-b\n+c';

    expect(
      hunksMovedOnlyByBase(patch([10, 3]), patch([10, 3]), editedLineEleven),
    ).toBe(false);
  });

  it('refuses a different number of hunks', () => {
    expect(
      hunksMovedOnlyByBase(patch([10, 3]), patch([10, 3], [40, 3]), ''),
    ).toBe(false);
  });

  it('refuses a header it cannot read, in the PR or the base patch', () => {
    expect(hunksMovedOnlyByBase('@@ bogus @@\n x', '@@ bogus @@\n x', '')).toBe(
      false,
    );
    expect(
      hunksMovedOnlyByBase(patch([10, 3]), patch([10, 3]), '@@ bogus @@\n x'),
    ).toBe(false);
  });
});
