# DEBT-482: Duplicate QIDs Collapse to One Output File

**Status:** In Progress — implementation verified locally; review and promotion pending
**Priority:** P1
**Date:** 2026-09-20
**Confidence:** CONFIRMED defect; no collision found in the measured local corpus

## Evidence

The original snapshot below predates #937's preflight-before-write change.
That change prevented writes on parsing failures, but did not reject duplicate
identities. The dated implementation receipt below supersedes the duplicate
behavior after reproducing it on the newer tree.

scripts/import-draft-questions.ts:84-106 converts and writes each block without
a corpus-wide identity/destination set. At :97 the filename is qid.mdx; :101
writeFile overwrites the same destination. The :105 counter counts blocks,
not distinct emitted questions. Snapshot: 6199084a1a4407d4d9d800bd798b37c422662b66.

## Reproduction

Run [DEBT-485's synthetic fixture](../_archive/debt/debt-485-import-output-path-traversal.md#read-only-reproduction-and-shared-fixture)
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

Preflight global QID uniqueness before writing any file. Reject duplicates with
both file/block locations. Under the existing writer, this also guarantees
distinct resolved destinations: conversion validates every QID against the
lowercase kebab-case slug schema (`lib/content/schemas.ts:72-75`), and the final
path component is exactly `<qid>.mdx`. Distinct valid QIDs cannot normalize to
one filename. A second path set would duplicate this protection and has no
independently reachable collision case under that contract. Revisit this proof
if output naming or slug validation changes. Do not silently keep first or
last, renumber, or collapse duplicates.

## Verification

Same-file, cross-file, cross-source, and cross-family duplicates fail before
writes. Distinct valid QIDs still import. Report parsed and distinct counts.

## Implementation receipt — 2026-09-20

**CONFIRMED:** a disposable CLI probe at `95c8f93e` reproduced all four cases:

| Input | Exit | CLI count | Actual output files |
|-------|------|-----------|---------------------|
| Same-file duplicate | 0 | questions=2 written=2 | 1 |
| Cross-file duplicate | 0 | questions=2 written=2 | 1 |
| Cross-source duplicate | 0 | questions=2 written=2 | 2, one shared QID |
| Cross-family duplicate | 0 | questions=2 written=2 | 2, one shared QID |

Before implementation,
`pnpm test --run scripts/import-draft-questions.test.ts` produced **10 failed /
12 passed**. Eight cases exercise all four duplicate arrangements in normal
and dry-run modes; another verifies an existing output is not overwritten;
the last requires the distinct count on a valid multi-file import. All use
synthetic content and real CLI processes in disposable directories.

`scripts/import-draft-questions.ts` now retains the first file/block location
for every validated QID during the existing all-files preflight. A second
occurrence rejects the entire import before the write loop, naming both
locations. The success summary includes parsed (`questions`) and distinct
(`uniqueQids`) counts. No seed identity, content, floor, CI or retry policy
changes are included.

`pnpm test --run scripts/draft-question-import.test.ts scripts/draft-question-split.test.ts scripts/import-draft-questions.test.ts`
passed **70/70**. A read-only CLI run against the current local corpus produced:

```text
pnpm exec tsx scripts/import-draft-questions.ts --in content/drafts/questions --out /tmp/content-integrity-2026-09-20/482-dry-run-output --dry-run
Imported draft questions: files=170 questions=948 written=0 (dry-run) uniqueQids=948
```

No real content or remote database rows were changed. The full local gate
passed: typecheck, lint, **4,340 unit / 411 browser / 293 integration** tests
(six existing opt-in skips), production build, and **44 authenticated TEST-mode
E2E** tests without retries against the clone's isolated Docker database.
Exact-head review, merge and promotion receipts remain pending.

## Related

Content-repository DEBT-06 documents its same-file duplicate-check defect.
The current clean census does not close either defect.
