# BUG-355: The Lockfile Union Check Refuses Correct Bundles Identical to a Source

**Status:** Open — judge lockfile unions structurally, including one source, red first
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

Step 6 of the "Bundling Overlapping Dependabot PRs" procedure, in the dependency update guide, verifies a bundle's lockfile with `scripts/verify-lockfile-union.ts`. For a bundle with a single source, the guide says to pass the base again as a second source. But the check refuses any candidate that is byte-identical to one of its sources. When pnpm regenerates exactly the source's lockfile, which is a correct outcome, the check exits 2 and the required step cannot pass.

The same refusal is wrong for multiple sources when one contains the others' changes. Byte identity does not prove an omission; the structured comparison already determines whether source changes are missing or conflict.

## Evidence

- **The guide's instruction.** In that step of `docs/guides/dependencies/updating-dependencies.md`: the verifier needs at least two sources, so for a single-source pull request, pass its base (`refs/pr/N^`) again as the second.
- **The check's rules.**
  - It requires two sources (`scripts/lockfile-union.ts:441`).
  - It refuses a candidate path equal to a source path (`:444`).
  - It refuses a candidate whose text equals any source's text (`:562-569`), with the message "a bundle must combine its sources".
- **Why the refusal exists.** Its comment (`:562-563`) says a candidate identical to one source "usually means a source was left off the command line". If the candidate carries the left-off source's changes, the structured comparison already reports them as `extra`; if it does not, neither check can see the omission.
- **Reproduced 2026-10-18** with the repository's fixtures:

  ```sh
  node --import tsx scripts/verify-lockfile-union.ts \
    --base scripts/fixtures/lockfile-union/base.yaml \
    --source scripts/fixtures/lockfile-union/source-826.yaml \
    --source scripts/fixtures/lockfile-union/base.yaml \
    --candidate <a copy of source-826.yaml>
  ```

  It exits 2 with that message.
- **Multiple-source counterexample.** Using `source-826.yaml` and `candidate-union.yaml` as two distinct sources with the same `base.yaml`, and a copy of `candidate-union.yaml` as candidate, also exits 2. Calling `compareLockfileUnion` on those contents returns empty `extra`, `missing`, `unmatched` and `conflicts` arrays; `lockfileUnionExitCode` returns 0. The second source contains the first's changes.
- **How often it bites is not known.** The guide re-authors Dependabot updates as repository-owned bundles, so single-source bundles occur. The refusal fires only when the regenerated lockfile matches the source byte for byte, and how often that happens has not been measured.

## Impact

A correct single-source or overlapping multi-source bundle can fail its required verification. The operator must stop; skipping a required verification is not an acceptable workaround.

Corrected 2026-10-18: prove the multi-source counterexample and remove the proposed byte-identity heuristic from both options and verification.

## Options

1. **Accept one `--source` and remove the identical-content refusal.** Use the existing structured union checks to reject actual extra, missing, unmatched or conflicting changes, regardless of byte identity. Drop the guide's base-as-second-source instruction.
2. **Keep the two-source workaround but remove the identical-content refusal.** This fixes the content rejection but preserves an unnecessary command-line restriction.

## Resolution (proposed)

Option 1.

## Verification

- [ ] A test with one source and an identical candidate fails first, then passes.
- [ ] A valid subset/superset union identical to one of two distinct sources passes, red first.
- [ ] A candidate that actually omits another source's changes still fails the structured comparison.
- [ ] Guide step 6 names a single source directly.

## Related

- DEBT-532: the scripts audit that found this.
