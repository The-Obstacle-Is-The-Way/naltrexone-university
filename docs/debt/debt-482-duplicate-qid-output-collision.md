# DEBT-482: Duplicate QIDs Collapse to One Output File

**Status:** Open
**Priority:** P1
**Date:** 2026-09-20
**Confidence:** CONFIRMED defect; no collision found in the measured local corpus

## Evidence

scripts/import-draft-questions.ts:84-106 converts and writes each block without
a corpus-wide identity/destination set. At :97 the filename is qid.mdx; :101
writeFile overwrites the same destination. The :105 counter counts blocks,
not distinct emitted questions. Snapshot: 6199084a1a4407d4d9d800bd798b37c422662b66.

## Reproduction

Run [DEBT-485's synthetic fixture](debt-485-import-output-path-traversal.md#read-only-reproduction-and-shared-fixture)
with PROBE=duplicate.

Observed: blocks=2, uniqueOutputs=1, two identical destination paths, no error.
Both individually parse and validate.

## Actual corpus census

Read-only 2026-09-20 census of the current content working tree and this app's
local imported tree:

| Measurement | Result |
|-------------|--------|
| Discovered draft files | 170 |
| Parsed blocks | 948 |
| Distinct draft QIDs | 948 |
| Distinct calculated output destinations | 948 |
| Local imported MDX files | 948 |
| Distinct imported slugs | 948 |
| Draft QIDs missing from local imported slug set | 0 |

These are local files, not a production database census. Production shipped
cardinality was not inspected; do not claim either fewer than 948 or exactly
948 live published rows.

Reproduce from the app root after setting CONTENT_ROOT to the content questions
directory; this command prints aggregates only:

    TSX_DISABLE_CACHE=1 node --import tsx - <<'JS'
    const fs = require('node:fs'), path = require('node:path');
    const fg = require('fast-glob'), matter = require('gray-matter');
    const lib = require('./scripts/draft-question-import.ts');
    const root = process.env.CONTENT_ROOT;
    if (!root) throw new Error('Set CONTENT_ROOT explicitly');
    const files = fg.sync(['**/recall.md', '**/vignettes.md'], { cwd: root });
    const ids = [], destinations = [];
    for (const file of files) {
      for (const block of lib.splitDraftQuestionsFile(
        fs.readFileSync(path.join(root, file), 'utf8'))) {
        const draft = lib.parseDraftQuestionBlock(block);
        ids.push(draft.frontmatter.qid);
        destinations.push(path.join(file.split(path.sep)[0],
          draft.frontmatter.source, draft.frontmatter.qid + '.mdx'));
      }
    }
    const imported = fg.sync('content/questions/imported/**/*.mdx');
    const slugs = imported.map(file =>
      matter(fs.readFileSync(file, 'utf8')).data.slug);
    console.log(JSON.stringify({
      files: files.length, blocks: ids.length,
      distinctQids: new Set(ids).size,
      distinctDestinations: new Set(destinations).size,
      importedFiles: imported.length, importedSlugs: new Set(slugs).size,
      missingImported: ids.filter(id => !slugs.includes(id)).length
    }));
    JS

## Failure scenario

Two accepted blocks overwrite one output while reporting two imports.
A duplicate QID in different source directories can also survive as separate
files targeting the same downstream identity.

## Smallest fix

Preflight global QID uniqueness and resolved output-path uniqueness before
writing any file. Reject duplicates with both file/block locations. Do not
silently keep first or last, renumber, or collapse duplicates.

## Verification

Same-file, cross-file, cross-source, and cross-family duplicates fail before
writes. Distinct valid QIDs still import. Report parsed and distinct counts.

## Related

Content-repository DEBT-06 documents its same-file duplicate-check defect.
The current clean census does not close either defect.
