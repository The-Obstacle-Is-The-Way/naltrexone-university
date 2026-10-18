# BUG-355: The Lockfile Union Check Refuses a Single-Source Bundle Whose Lockfile Matches Its Source

**Status:** Open — accept one source, and refuse a candidate equal to a source only when several are named; red first
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

Step 6 of the "Bundling Overlapping Dependabot PRs" procedure, in the dependency update guide, verifies a bundle's lockfile with `scripts/verify-lockfile-union.ts`. For a bundle with a single source, the guide says to pass the base again as a second source. But the check refuses any candidate that is byte-identical to one of its sources. When pnpm regenerates exactly the source's lockfile, which is a correct outcome, the check exits 2 and the required step cannot pass.

## Evidence

- **The guide's instruction.** In that step of `docs/guides/dependencies/updating-dependencies.md`: the verifier needs at least two sources, so for a single-source pull request, pass its base (`refs/pr/N^`) again as the second.
- **The check's rules.**
  - It requires two sources (`scripts/lockfile-union.ts:441`).
  - It refuses a candidate path equal to a source path (`:444`).
  - It refuses a candidate whose text equals any source's text (`:562-569`), with the message "a bundle must combine its sources".
- **Reproduced 2026-10-18** with the repository's fixtures:

  ```sh
  node --import tsx scripts/verify-lockfile-union.ts \
    --base scripts/fixtures/lockfile-union/base.yaml \
    --source scripts/fixtures/lockfile-union/source-826.yaml \
    --source scripts/fixtures/lockfile-union/base.yaml \
    --candidate <a copy of source-826.yaml>
  ```

  It exits 2 with that message.
- **How often it bites is not known.** The guide re-authors Dependabot updates as repository-owned bundles, so single-source bundles occur. The refusal fires only when the regenerated lockfile matches the source byte for byte, and how often that happens has not been measured.

## Impact

A correct single-source bundle can fail its required verification. The operator must then stop, or skip a step the guide requires.

## Options

1. **Accept one `--source`,** and apply the identical-candidate refusal only when two or more sources are named, where it still signals a forgotten source. Then drop the guide's base-as-second-source instruction.
2. **Keep two sources, and skip the identical-candidate refusal when only one source differs from the base.** This keeps the workaround in the guide.

## Resolution (proposed)

Option 1.

## Verification

- [ ] A test with one source and an identical candidate fails first, then passes.
- [ ] A candidate identical to one of two sources still fails.
- [ ] Guide step 6 names a single source directly.

## Related

- DEBT-532: the scripts audit that found this.
