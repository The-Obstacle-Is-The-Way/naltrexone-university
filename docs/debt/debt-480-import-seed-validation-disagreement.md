# DEBT-480: Import and Seed Validation Disagreement

**Status:** Open
**Priority:** P1
**Date:** 2026-09-20
**Confidence:** CONFIRMED

## Evidence

At app commit 6199084a1a4407d4d9d800bd798b37c422662b66:
scripts/draft-question-import.ts:180 parses headings but does not reject an
empty extracted stem; :291 validates only MDX frontmatter.
lib/content/parse-mdx-question.ts:63 rejects an empty stem.
scripts/seed/question-parser.ts:91 invokes that stricter body parser.
content/drafts/questions/SCHEMA.md:284 requires a final Reference subsection.

Missing references expose a separate contract hole within this same body-
validation boundary: scripts/seed-helpers.ts:118 parses references and returns
null when absent. Do not claim seed rejects missing references; it currently
accepts them too.

## Reproduction

Run [DEBT-479's read-only synthetic fixture](debt-479-import-output-path-traversal.md#read-only-reproduction-and-shared-fixture)
twice, setting PROBE=empty and PROBE=no_reference.

Observed:

- empty: importer parses/converts one block; seed accepted=false,
  error="Stem markdown is empty after parsing".
- no_reference: importer parses/converts one block; seed accepted=true,
  reference=null.

No question files or database rows are modified by either probe.

## Failure scenario

A green import dry run produces content that fails during a later seed, possibly
after earlier files have committed. Separately, uncited content can pass both
validators despite the authoring contract.

## Smallest fix

Use one complete body-validation boundary for import and seed, including
nonempty canonicalized stem/explanation and the required nonempty final
reference. Preserve parsing/rendering semantics; sharing frontmatter Zod alone
is not the fix. Update any intentional exceptions explicitly in the contract
rather than silently accepting them.

## Verification

Positive fixture with body/reference passes both paths. Empty/whitespace body,
missing/empty reference, invalid heading order, and trailing material violating
the reference placement contract fail consistently before output writes.
Verify actual parseSeedQuestionFile parity without database access.

## Related

- [DEBT-479](debt-479-import-output-path-traversal.md)
- [DEBT-483](debt-483-content-withdrawal-and-release-rollback.md)
