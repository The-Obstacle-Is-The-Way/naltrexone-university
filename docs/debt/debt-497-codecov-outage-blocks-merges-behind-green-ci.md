# DEBT-497: A Codecov Outage Blocks Every Merge Behind Green CI

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the fix is written and tested (2026-10-05); the record closes once it is in production ([Progress](#progress))
**Priority:** P3
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Codecov's `*.codecov.io` certificate expired at 2026-10-04 23:59:59 UTC (`notAfter=Oct 4 23:59:59 2026 GMT`, served by `ingest.codecov.io`), while status.codecov.com reported "All Systems Operational". From then on, no coverage upload reached Codecov:
- CI's `Upload coverage to Codecov` step could not download its CLI. It reported `success`, because `.github/workflows/ci.yml` sets `fail_ci_if_error: false`.
- No `codecov/patch` status was posted, so `scripts/merge-reviewed-pr.ts` refused to merge #1362, approved on its exact head. The refusal was correct.
- #1362 changes only documentation and `.coderabbit.yaml`, where line coverage measures nothing.

## Evidence

- **CI run 37247653520.** The upload step logged `Could not verify signature`, `./codecov: No such file or directory` and `Failed to run upload-coverage`, then concluded `success`.
- **Probes from a workstation, 00:51Z–09:07Z.**
  - `ingest.codecov.io` and `api.codecov.io` returned `CERT_HAS_EXPIRED`.
  - `cli.codecov.io` failed its TLS handshake.
  - `pypi.org/simple/codecov-cli/` answered 200. The CLI could still be installed from PyPI, but its upload would still meet the expired certificate.
- **The outage was widespread:** codecov/codecov-action#788, and other repositories' issues about blocked coverage checks on 2026-10-05.
- **It ended at about 09:07Z,** when `ingest.codecov.io` began serving a certificate valid until 2027-04-20. #1362's CI was re-run once, `codecov/patch` posted success, and #1362 merged about eight hours after its approval.
- **The merge guard already excuses some changes.** ADR-020's amendment of 2026-09-28 lets `codecov/patch` be missing only for changes confined to dependency manifests or CI workflows (`codecovNotApplicable`), since coverage measures no lines there. Documentation and repository-tool configuration are just as unmeasured, but are not excused.

## Impact

- **Merges stop.** While Codecov is down, every feature merge stops except a change confined to dependency manifests or CI workflows, which ADR-020 already excuses. That includes changes to documentation and repository-tool configuration, where coverage measures nothing.
- **The stop is hidden.** CI shows green, and the stop surfaces only when the merge guard refuses.

## Options

1. **Change nothing.** A code change should wait for its coverage signal; outages are rare. Docs-only work stalls with it.
2. **Extend ADR-020's exemption to changes confined to documentation (`*.md`) and repository-tool configuration (`.coderabbit.yaml`, `codecov.yml`).** It applies only when `codecov/patch` is missing, never when it failed. This is the same reasoning ADR-020 already applies to manifests and workflows.
3. **Make the upload failure visible.** A CI step after the upload notes, in the job summary, whether Codecov accepted the report. It warns without failing the job, so the cause shows next to the green check.
4. **Compute patch coverage in CI from the uploaded Istanbul maps,** with no third party. This removes the dependency, but it is a large change to a working gate.

## Resolution (decided)

Options 2 and 3, together with an outage procedure in AGENTS.md:
- **Confirm the outage first:** verify it from the certificate or the ingest error, and record the cause on the PR.
- **Code changes wait** for Codecov.
- **Documentation- and configuration-only changes merge** under the extended exemption.

Option 4 is not justified by one outage. It is revisited if a second outage blocks code changes for longer than a day.

## Progress

**The fix, 2026-10-05.**
- **Merge guard.** `scripts/merge-reviewed-pr.ts`'s unmeasured paths (`isUnmeasuredPath`) gain Markdown documentation and `.coderabbit.yaml` and `codecov.yml`. A missing `codecov/patch` is excused only on a complete file list confined to them. A posted failure, a truncated list or any measured path still blocks.
- **CI.** The upload step sets `fail_ci_if_error: true` with `continue-on-error: true`, and a new step, "Report a failed Codecov upload", writes a job warning and summary when it fails. `tests/ci-workflow.test.ts` pins both.
- **Records.** ADR-020 gains its 2026-10-05 amendment, and AGENTS.md (How to Check) the Codecov outage procedure.
- **Evidence.** The documentation case and the workflow case were red first. Five targeted mutations of the path set, one per path kind, each fail a case.

## Verification

- [x] `merge-reviewed-pr.ts` excuses a missing `codecov/patch` for a change confined to the extended paths, and still refuses a failed status, or any change touching code.
- [x] Both cases are proven by red-first unit cases.
- [x] CI reports a failed Codecov upload as a job warning and summary, without failing the job. The upload has no condition of its own, so it is skipped only when an earlier step failed, and then the job is already red. A green job with no warning therefore had an accepted upload.
- [x] AGENTS.md records the outage procedure.
