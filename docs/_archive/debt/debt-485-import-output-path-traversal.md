# DEBT-485: Import Output Path Traversal

**Status:** Resolved — PR #937; independently verified 2026-09-20
**Priority:** P0 at filing; no remaining implementation in this record
**Date:** 2026-09-20
**ID reconciliation:** Renumbered from DEBT-479 after PR #937 collided with the owner's reserved public-surface IDs; original evidence is preserved; the verified closeout below updates the current status.
**Confidence:** CONFIRMED
**Scope:** Historical filesystem-boundary defect; implementation and closeout below

## Resolution and current state — 2026-09-20

**CONFIRMED:** [PR #937](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/937) merged as `92f70c71` with CodeRabbit approval on exact source head `47475641`. Current [`draft-question-import.ts:38-43`](../../../scripts/draft-question-import.ts#L38) requires a kebab-case source identifier. [`draftQuestionOutputPath:336-354`](../../../scripts/draft-question-import.ts#L336) resolves the destination and rejects escape using `path.relative`. The [CLI:105-138](../../../scripts/import-draft-questions.ts#L105) preflights all converted destinations before writing; [`assertNoOutputSymlinks:70-87`](../../../scripts/import-draft-questions.ts#L70) checks the root and every existing component through the destination file, with checks repeated immediately before writes.

Independent current-tree verification on `bc9d08ff`:

```text
pnpm test --run scripts/draft-question-import.test.ts scripts/import-draft-questions.test.ts
Test Files 2 passed; Tests 42 passed
```

The [real-CLI tests:85-157](../../../scripts/import-draft-questions.test.ts#L85) exercise valid writes, invalid-later-source preflight, root/group/source/file symlinks, and dry-run behavior in disposable directories. The [resolver/parser tests:675-730](../../../scripts/draft-question-import.test.ts#L675) cover nine invalid source forms and five escaping destination cases. The already-read combined CI [35521904534](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35521904534) also passed all 4,308 unit, 411 browser, 293 integration plus six opt-in skips, build and 44 E2E cases. PR #937 reports historical red results for 15 traversal and six preflight/symlink cases; this closeout independently reran their green tests, not those historical mutations.

Regression mutations are concrete: relaxing the source schema to `z.string().min(1)` breaks the invalid-source cases; returning the resolved destination without the containment guard breaks the escape cases; removing the symlink checks breaks the real-CLI symlink cases. These are descriptions of the existing guards' failure witnesses, not newly executed mutation results.

Main CI [35520945376](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35520945376) succeeded on `92f70c71732000f4390f992c71623c8518c72ba9`. The authenticated public-alias readback named `dpl_sG7qJfmEvg22mQDhU1YU5sZMdnE1`; its deployment returned `READY`, `target: production`, that SHA and `aliasAssigned: true`. This confirms release ancestry, not a production CLI import. No production import or database mutation was performed here.

Existing-symlink rejection does not claim protection against concurrent hostile filesystem replacement. Preflight is not atomic publication or rollback after an I/O failure. Those are not silently added closure requirements; the distinct parser, duplicate-output, withdrawal and history records remain separate.

## Historical pre-fix evidence

At historical pre-fix app commit 6199084a1a4407d4d9d800bd798b37c422662b66,
scripts/draft-question-import.ts:37 validates source only as a nonempty string.
scripts/import-draft-questions.ts:96 joins that value into the destination;
:101 writes the resulting path. This is a filesystem boundary defect regardless
of whether its caller is trusted. No malicious-source incident is asserted.

## Read-only reproduction and shared fixture

To reproduce the historical traversal output, run from an isolated checkout of
`6199084a1a4407d4d9d800bd798b37c422662b66` with its locked dependencies. This
synthetic fixture contains no proprietary question text, writes no files and
accesses no DB. On the current tree, traversal is rejected during parsing; the
fixture's own `path.join` is not the current production destination resolver.
The same command supports the modes cited by DEBT-486, DEBT-487, and DEBT-482.

    PROBE=traversal TSX_DISABLE_CACHE=1 node --import tsx - <<'JS'
    const path = require('node:path');
    const lib = require('./scripts/draft-question-import.ts');
    const { parseSeedQuestionFile } = require('./scripts/seed/question-parser.ts');
    const mode = process.env.PROBE;
    let data = {
      qid: 'review-example-001', type: 'recall', difficulty: 'easy',
      substances: ['alcohol'], topics: ['general'], source: 'review-fixture',
      choices: [
        { label: 'A', text: 'First option', correct: true },
        { label: 'B', text: 'Second option', correct: false,
          explanation: 'A synthetic explanation.' }
      ]
    };
    let body = '## Question\n\nWhich option applies?\n\n## Explanation\n\nA synthetic explanation.\n\n### Reference\n\nSynthetic fixture citation.';
    if (mode === 'traversal') data.source = '../../../../outside';
    if (mode === 'empty') body = '## Question\n\n## Explanation\n\nExplanation.';
    if (mode === 'no_reference') body = '## Question\n\nQuestion?\n\n## Explanation\n\nExplanation.';
    if (mode === 'reordered') data = { type: data.type, ...data };
    const block = '---\n' + Object.entries(data)
      .map(([key, value]) => key + ': ' + JSON.stringify(value))
      .join('\n') + '\n---\n\n' + body;
    const raw = mode === 'duplicate' ? block + '\n' + block : block;
    const blocks = lib.splitDraftQuestionsFile(raw);
    const outputs = [];
    const seed = [];
    for (const item of blocks) {
      const draft = lib.parseDraftQuestionBlock(item);
      const mdx = lib.convertDraftQuestionToMdx({ draft, status: 'draft' });
      outputs.push(path.join('content/questions/imported', 'fixture',
        draft.frontmatter.source, draft.frontmatter.qid + '.mdx'));
      try {
        seed.push({ accepted: true,
          reference: parseSeedQuestionFile(mdx).reference_md });
      } catch (error) {
        seed.push({ accepted: false, error: error.message });
      }
    }
    console.log(JSON.stringify({
      blocks: blocks.length, outputs,
      uniqueOutputs: new Set(outputs).size, seed
    }));
    JS

Historical observed traversal output: blocks=1, outputs=["outside/review-example-001.mdx"],
uniqueOutputs=1, seed accepted=true. The output escaped
content/questions/imported. This calculated the pre-fix writer's destination
without executing its write operation; it does not prove current writer behavior.

## Historical failure scenario

Malformed source metadata writes an MDX file outside the designated import root.
A future generator increases the number of opportunities for malformed metadata;
it is not necessary to demonstrate the boundary defect.

## Original repair criteria — implemented by #937

Define a safe source-identifier grammar, validate it, resolve each destination,
and reject any destination not contained within the configured output root.
Define behavior for platform separators and existing symlinks rather than
assuming a lexical check covers both. Preflight all destinations before writes.

## Original verification criteria — satisfied above

Red fixtures for traversal, absolute/mixed separator paths, and containment
failure must fail before any write. Ordinary source identifiers still import.
Use a disposable test directory for the future writer test, not a production
content tree. The fix is in #937; this document records its historical criteria and verified closeout.

## Related

- [DEBT-486: Import/seed disagreement](../../debt/debt-486-import-seed-validation-disagreement.md)
- [DEBT-487: Silent omission](../../debt/debt-487-draft-splitter-silent-omission.md)
- [DEBT-482: Duplicate output collisions](../../debt/debt-482-duplicate-qid-output-collision.md)
