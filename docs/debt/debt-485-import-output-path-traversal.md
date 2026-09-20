# DEBT-485: Import Output Path Traversal

**Status:** Open
**Priority:** P0
**Date:** 2026-09-20
**ID reconciliation:** Renumbered from DEBT-479 after PR #937 collided with the owner's reserved public-surface IDs; original evidence and status are preserved.
**Confidence:** CONFIRMED
**Scope:** Highest-priority repair in the content-import review set

## Evidence

At app commit 6199084a1a4407d4d9d800bd798b37c422662b66,
scripts/draft-question-import.ts:37 validates source only as a nonempty string.
scripts/import-draft-questions.ts:96 joins that value into the destination;
:101 writes the resulting path. This is a filesystem boundary defect regardless
of whether its caller is trusted. No malicious-source incident is asserted.

## Read-only reproduction and shared fixture

Run from the app root with installed locked dependencies. This synthetic fixture
contains no proprietary question text. It writes no files and accesses no DB.
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

Observed traversal output: blocks=1, outputs=["outside/review-example-001.mdx"],
uniqueOutputs=1, seed accepted=true. The output escaped
content/questions/imported. This calculates the shipped writer's destination
without executing its write operation.

## Failure scenario

Malformed source metadata writes an MDX file outside the designated import root.
A future generator increases the number of opportunities for malformed metadata;
it is not necessary to demonstrate the boundary defect.

## Smallest fix

Define a safe source-identifier grammar, validate it, resolve each destination,
and reject any destination not contained within the configured output root.
Define behavior for platform separators and existing symlinks rather than
assuming a lexical check covers both. Preflight all destinations before writes.

## Verification

Red fixtures for traversal, absolute/mixed separator paths, and containment
failure must fail before any write. Ordinary source identifiers still import.
Use a disposable test directory for the future writer test, not a production
content tree. This document does not implement the fix.

## Related

- [DEBT-486: Import/seed disagreement](debt-486-import-seed-validation-disagreement.md)
- [DEBT-487: Silent omission](debt-487-draft-splitter-silent-omission.md)
- [DEBT-482: Duplicate output collisions](debt-482-duplicate-qid-output-collision.md)
