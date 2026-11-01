// Unified-diff hunks from GitHub's compare API, compared the way a clean
// rebase moves them: the changed and context lines must match, and a hunk may
// sit elsewhere only by the lines the base's own edits added or removed above
// it.

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/;

type Hunk = { start: number; lines: number };
// A base edit removes `removed` lines from line `at` of the earlier base's
// file and inserts `added` lines there.
type Edit = { at: number; removed: number; added: number };

// A patch with each hunk header reduced to a boundary marker.
export function hunkBodies(patch: string) {
  return patch
    .split('\n')
    .map((line) => (line.startsWith('@@') ? '@@' : line))
    .join('\n');
}

function hunks(patch: string): Hunk[] | undefined {
  const found: Hunk[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('@@')) continue;
    const match = HUNK_HEADER.exec(line);
    if (!match) return undefined;
    found.push({ start: Number(match[1]), lines: Number(match[2] ?? 1) });
  }
  return found;
}

function edits(patch: string): Edit[] | undefined {
  const found: Edit[] = [];
  let line = 0;
  let edit: Edit | undefined;
  for (const text of patch.split('\n')) {
    if (text.startsWith('@@')) {
      const match = HUNK_HEADER.exec(text);
      if (!match) return undefined;
      // A hunk with no old lines inserts after its start line.
      line = Number(match[1]) + (match[2] === '0' ? 1 : 0);
      edit = undefined;
    } else if (text.startsWith('-') || text.startsWith('+')) {
      if (!edit) {
        edit = { at: line, removed: 0, added: 0 };
        found.push(edit);
      }
      if (text.startsWith('-')) {
        edit.removed += 1;
        line += 1;
      } else {
        edit.added += 1;
      }
    } else if (!text.startsWith('\\')) {
      edit = undefined;
      line += 1;
    }
  }
  return found;
}

// Where a hunk of the earlier base's file starts in the later base's file, or
// undefined when a base edit falls inside the lines it covers.
function movedStart(baseEdits: Edit[], hunk: Hunk) {
  let shift = 0;
  for (const edit of baseEdits) {
    if (edit.at + edit.removed <= hunk.start) {
      shift += edit.added - edit.removed;
    } else if (edit.at < hunk.start + hunk.lines) {
      return undefined;
    }
  }
  return hunk.start + shift;
}

// Whether the current patch's hunks sit where the approved patch's hunks land
// after the base's edits to the file (`basePatch`; empty when the base left
// the file alone).
export function hunksMovedOnlyByBase(
  approved: string,
  current: string,
  basePatch: string,
) {
  const before = hunks(approved);
  const after = hunks(current);
  const baseEdits = edits(basePatch);
  return (
    before !== undefined &&
    after !== undefined &&
    baseEdits !== undefined &&
    before.length === after.length &&
    before.every(
      (hunk, index) => movedStart(baseEdits, hunk) === after[index]?.start,
    )
  );
}
