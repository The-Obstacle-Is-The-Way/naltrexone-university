# DEBT-487: Frontmatter Order Can Silently Omit Questions

**Status:** Open
**Priority:** P1
**Date:** 2026-09-20
**ID reconciliation:** Renumbered from DEBT-481 after PR #937 collided with the owner's reserved public-surface IDs; original evidence and status are preserved.
**Confidence:** CONFIRMED

## Evidence

scripts/draft-question-import.ts:107 recognizes only a delimiter immediately
followed by qid. At :120 it returns an empty array when no such block is found.
scripts/import-draft-questions.ts:77 rejects zero discovered files, but :84
does not reject zero blocks within a discovered file. :111 prints aggregate
success counts. Snapshot: 6199084a1a4407d4d9d800bd798b37c422662b66.

The authoring ordering rule is content/drafts/questions/SCHEMA.md:201. A format
violation should be rejected, not treated as absent input.

## Reproduction

Run [DEBT-485's synthetic fixture](../_archive/debt/debt-485-import-output-path-traversal.md#read-only-reproduction-and-shared-fixture)
with PROBE=reordered. It places type before qid.

Observed: blocks=0, outputs=[], uniqueOutputs=0, seed=[]; no exception.
The CLI's file loop then processes no block for that discovered file, by :84-106.

## Failure scenario

A generator changes YAML key ordering and a whole file disappears from the
import while the overall command reports success. In a mixed file, malformed
blocks may instead be folded into an adjacent block; complete consumption must
also be checked, not merely an overall nonzero count.

## Smallest fix

Fail on unconsumed or malformed candidate blocks, and on zero questions in any
discovered question file. Either support arbitrary YAML key order deliberately
or enforce qid-first with an explicit error. Do not silently relax the format
contract as a side effect of a splitter change.

## Verification

Reordered first, middle, and last blocks, CRLF input, preambles, and adjacent
blocks must produce explicit acceptance or rejection without omission or
absorption. Assert discovered/parsed identities and full block consumption.
A corpus-wide positive total alone cannot close this debt.

## Related

- [DEBT-482](debt-482-duplicate-qid-output-collision.md)
