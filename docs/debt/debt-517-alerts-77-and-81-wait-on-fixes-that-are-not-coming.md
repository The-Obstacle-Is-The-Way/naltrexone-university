# DEBT-517: Alerts #77 and #81 Wait on Fixes That Are Not Coming

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — `braces` and `sprintf-js` are out of the lockfile; after promotion, Dependabot marks alerts #77 and #81 fixed on `main`; due 2026-10-25
**Priority:** P3
**Date:** 2026-10-11
**Resolved:** —
**Verification receipts:** [Evidence](#evidence), [Verification](#verification)

---

## Summary

Dependabot alerts #77 (`braces`, high) and #81 (`sprintf-js`, moderate) were accepted risks. [DEBT-495](../_archive/debt/debt-495-braces-dos-advisory-without-fixed-release.md) and [DEBT-506](../_archive/debt/debt-506-dependabot-alert-triage-2026-10.md) kept them open as watchers, so that Dependabot would raise the fix pull request when a fixed release shipped. Neither fix is coming. Each package reached the lockfile through one direct dependency used only by operator scripts and test scans. This record replaces those two dependencies, so both packages leave the lockfile and the alerts close as fixed.

Neither advisory was exploitable here, and this change does not alter that. What it removes is two alerts that would otherwise stay open for good beside real ones, 21 packages, and a path by which the seed parser ran `---js` front matter through `eval`.

## Evidence

- **No fix for `braces`.** The advisory ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) names no patched version, and 3.0.3 is still npm's latest. On [micromatch/braces#70](https://github.com/micromatch/braces/issues/70) the maintainer disputes the report (2026-10-05): the length cap already bounds nesting depth, and user-supplied glob patterns are the real risk. The issue is locked, with no linked pull request.
- **No fix for `sprintf-js`.** The advisory ([GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)) names no patched version, and 1.1.3 is still npm's latest. On [alexei/sprintf.js#237](https://github.com/alexei/sprintf.js/issues/237) a CNA dispute has been filed (2026-10-06), and the proposed fix was closed because it only swapped one exception for another.
- **One route each.**
  - `braces` came only through `fast-glob` → `micromatch`, now that DEBT-506 removed the React Native tree. When DEBT-495 was decided, that tree also carried `braces`, so replacing `fast-glob` could not have closed #77.
  - `sprintf-js` came only through `gray-matter` → `js-yaml` 3 → `argparse` 1.
- **Callers.** No module in `app/`, `components/`, `lib/` or `src/` imported either library. `fast-glob` was imported by five test source scans, the seed file reader, the draft importer and the CRAP report. `gray-matter` was imported by the seed parser, the seed syncer's error context and the draft importer, and by the draft importer's test.
- **The replacements.**
  - `tinyglobby` 0.2.17 was already installed through Vite and Vitest.
  - `@11ty/gray-matter` 3.0.0 is Eleventy's maintained fork. Its `index.js`, `lib/parse.js`, `lib/defaults.js` and `lib/excerpt.js` are byte-identical to `gray-matter` 4.0.3. It parses YAML with `js-yaml` 5's safe `load`, refuses `---js` front matter, which 4.0.3 ran through `eval`, and drops `kind-of`, `strip-bom-string` and `Buffer` for built-ins.
  - GitHub's advisory database lists no advisory for `tinyglobby` 0.2.17, `@11ty/gray-matter` 3.0.0, `js-yaml` 5.4.2 or `argparse` 2.0.1 (checked 2026-10-11).

## Options

1. **Keep both alerts open as watchers.** This is the status quo. The fixes they wait for are not coming, so the alerts stay open for good, one of them high.
2. **Dismiss them, or add an auto-triage rule that dismisses them until a patch is available.** No code changes, and the rule keeps the watcher. It leaves the dead chains, the `js-yaml` 3 override and `gray-matter`'s `eval` path in place.
3. **Replace the two direct dependencies (chosen).** Both packages leave the lockfile, and so do 22 others. It also closes the `eval` path and removes the override. The cost is one reviewed change to scripts and test scans, proven by the parity checks below.
4. **Write a front-matter splitter in the repository.** This would re-implement parsing that the fork keeps byte-identical to `gray-matter`, so it carries more risk of divergence for no gain.

## Change

- **`fast-glob` → `tinyglobby`** at all eight call sites, each with `expandDirectories: false`, the setting tinyglobby documents for fast-glob parity. Removes `fast-glob`, `micromatch`, `braces` and 15 of their dependencies.
- **`gray-matter` → `@11ty/gray-matter`** at all four import sites. Removes `gray-matter`, `js-yaml` 3, `argparse` 1, `sprintf-js`, `esprima` and `strip-bom-string`, and adds `js-yaml` 5.4.2 and `argparse` 2.0.1.
- **The `js-yaml` 3.15.2 override is removed.** No `js-yaml` 3 remains. Left in place, the override would have forced the fork onto `js-yaml` 3, whose `load` uses the full schema and builds functions from `!!js/function`. `js-yaml` 5.4.2 is outside the vulnerable ranges of the three advisories that override covered (GHSA-2883-xcg3-v3hh, GHSA-h67p-54hq-rp68, GHSA-5p4m-2wfm-xmqj). 5.4.3 is not yet past the 7-day gate.
- **The upstream advisory watch** maps the two new direct dependencies in place of the removed ones.
- **The guards.**
  - `scripts/seed.test.ts` gains two tests. The first fails on `gray-matter` 4.0.3, where the `---js` block runs, and passes on the fork. The second checks that `!!js/function` is rejected as a YAML error.
  - Dependabot raises #77 or #81 again if either package returns.

## Verification

- [x] **Lockfile.** 24 packages removed and 3 added, from 831 to 810. None of `braces`, `micromatch`, `fast-glob`, `sprintf-js`, `argparse` 1, `js-yaml` 3 or `gray-matter` remains.
- [x] **Glob parity.** Every call site returns exactly the file set it returned with `fast-glob`: 453, 1,552, 982, 1,577 and 117 files for the five scans, 958 and 948 seed files, 505 CRAP-report sources and 170 draft files. Results that are not sorted come back in a different order. Neither library guarantees an order. The seed and release staging match files by slug, and the draft importer writes one file per QID, so the order has no effect.
- [x] **Front-matter parity.** Every `.md` and `.mdx` file in four clones' `content/` trees was parsed with both `gray-matter` 4.0.3 and the fork, and so was every draft question block. That was 33,708 inputs, 27,864 of them with front matter. The two differed in no `data`, `content` or thrown error. The front matter holds only mappings, strings, arrays and booleans, so `js-yaml` 5's schema changes (timestamps, merge keys, octal) do not apply.
- [x] **End to end.** The draft-import dry run reads 170 files into 948 questions with 948 unique QIDs.
- [x] **Stored content unchanged.** The local test database was seeded with the old code (`dev` at `b581cfac`) and then with this branch. The seed compares each file with its stored revision canonically. Both runs reported `inserted=0 updated=0 (new revisions=0) skipped=958`, and the run without placeholders reported `skipped=948`. So the new parser produces exactly the content already stored.
- [x] **Gate.** Typecheck and the unit suite pass: 7,796 tests in 634 files.
- [ ] **After promotion.** Dependabot marks #77 and #81 fixed on `main`, not dismissed. Due 2026-10-25.

## Related

- [DEBT-495](../_archive/debt/debt-495-braces-dos-advisory-without-fixed-release.md): the `braces` risk acceptance this supersedes.
- [DEBT-506](../_archive/debt/debt-506-dependabot-alert-triage-2026-10.md): the `sprintf-js` risk acceptance this supersedes.
- [DEBT-476](../_archive/debt/debt-476-dependabot-alert-triage-2026-09.md): the `js-yaml` 3 override this removes.
