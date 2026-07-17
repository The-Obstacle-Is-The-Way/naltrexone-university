# DEBT-459: The Button Mandate Is Ambiguous for Test-Only Probe Controls

**Status:** Resolved
**Priority:** P4
**Date:** 2026-07-16
**Confirmed:** 2026-07-16 (fix-wave-4 close precedent adjudication; confirmed by the frontend rule text, the production-only scanner contract, and repository-wide test practice)
**Resolved:** 2026-07-17

---

## Description

The frontend gateway and standards say that all interactive click targets under `app/**` and `components/**` must use the shared `<Button>`, with only production primitive/app-shell exceptions. The enforcement layer intentionally defines a narrower contract: `PRODUCTION_UI_SOURCE_IGNORE_GLOBS` excludes `*.test.tsx`, `*.browser.spec.tsx`, `*test-helpers.tsx`, and `*.probes.tsx`. The archived DEBT-398 decision explicitly says to scan **production UI source files only** and names those exclusions.

That distinction is not stated in the live rule text, so automated review has reached opposite decisions on equivalent browser-test probe controls: one wave replaced native probe buttons with `<Button>`, while BUG-301 correctly defended the same finding as outside the production design-system boundary. The current tree contains 71 native `<button>` occurrences across 22 browser-spec files, consistent with the scanner's deliberate test isolation rather than isolated drift.

## Fix-Wave-4 Ruling

Native semantic controls are allowed in **test-only probe components** when they exist solely to drive a hook or state-machine boundary. They are not shipped interaction targets, and importing the production Button primitive can add styling/slot behavior unrelated to the behavior under test. The shared `<Button>` remains mandatory for every production UI click target and for tests whose subject is the Button/design-system behavior itself.

This ruling preserves both existing sources of truth:

- the production scanner continues to reject raw buttons in shipped UI; and
- focused test probes may use the smallest native semantic control needed to exercise the subject.

## Impact

The ambiguity creates recurring false-positive review work and inconsistent test harness dependencies. It does not affect users or weaken the production component-system gate. P4 is appropriate.

## Proposed Resolution

1. Add one explicit test-probe scope sentence to `AGENTS.md`, `.claude/rules/frontend.md`, and `docs/frontend/standards.md`: the Button mandate applies to production UI; the scanner's existing test/probe exclusions are intentional.
2. Narrow CodeRabbit/path-rule inference for `*.test.tsx`, `*.browser.spec.tsx`, `*test-helpers.tsx`, and `*.probes.tsx`, or add the same exception to the browser-testing rule so equivalent findings are adjudicated consistently.
3. Keep `components/theme-token-regression-source-scan.ts` unchanged except for a nearby contract comment if needed; its current glob behavior already implements the ruling.
4. Verify a synthetic raw button still fails in production UI while an equivalent browser-test probe is excluded, and confirm review guidance no longer requests a production Button dependency for hook-only probes.

## Resolution

Resolved on 2026-07-17 on branch
`debt/459-test-probe-button-rule-scope`:

1. `AGENTS.md`, `.claude/rules/frontend.md`, and
   `docs/frontend/standards.md` now state the same boundary: the shared
   `<Button>` mandate governs production UI; native semantic controls are
   allowed only in test-only hook/state-machine probes covered by the existing
   `*.test.tsx`, `*.browser.spec.tsx`, `*test-helpers.tsx`, and `*.probes.tsx`
   exclusions; tests of Button/design-system behavior still use `<Button>`.
2. `components/theme-token-regression-source-scan.ts` remains unchanged
   because its existing production globs and exclusions already implement the
   ruling.
3. A temporary `components/debt-459-production-probe.tsx` containing a raw
   `<button>` made the source-scan regression test fail with the expected
   file-and-line diagnostic. After removing that file, the same test passed
   while a temporary
   `components/debt-459-browser-probe.browser.spec.tsx` raw-button probe was
   present, proving the test-only exclusion. Both temporary files were removed
   before commit.

## Related

- [DEBT-398 (archived)](./debt-398-design-system-enforcement-gap.md) — explicitly selected production-only source scanning and the test/probe ignore globs.
- [DEBT-399 (archived)](./debt-399-component-system-bypass-cleanup.md) — removed every temporary production raw-button bypass.

Filed during the 2026-07-16 fix-wave-4 close review after adjudicating the BUG-299/BUG-301 CodeRabbit precedent.
