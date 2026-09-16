# DEBT-476: Dependabot Alert Triage — What #882/#886 Closed and the Four-Package Residue

**Status:** Open — remediation shipped (#888 → promo #889, 2026-09-16); twelve of thirteen alerts `fixed`, #55 dismissed `not_used` on owner approval 2026-09-16; remaining: `fast-uri` 3.1.8 follow-up after 2026-09-22T07:36Z, then archive
**Priority:** P2 — at filing, nothing was reachable from a production request path, but five High-rated alerts across two transitive packages sat in the default-branch lockfile and one alert could not be closed by any version pin
**Date:** 2026-09-15
**Source:** Owner question after PR #882 (`chore/dependabot-batch-2026-09-14`) merged to `dev` and promo #886 opened: do the 13 open Dependabot alerts get squashed by that merge, or do some still need handling?
**Related:** [DEBT-393](../_archive/debt/debt-393-dependabot-triage-and-config-hardening.md) (Dependabot triage protocol and config), [DEBT-394](../_archive/debt/debt-394-supply-chain-hardening.md) (7-day `minimumReleaseAge` gate and override discipline), [`docs/dev/supply-chain-overrides.md`](../dev/supply-chain-overrides.md) (override playbook; js-yaml worked example), [`docs/dev/dependency-update-protocol.md`](../dev/dependency-update-protocol.md) (full-gate and E2E rules for repo-owned dependency PRs), [DEBT-474](./debt-474-ci-secret-scope-and-action-immutability.md) (never run a Dependabot head locally with shared credentials), [DEBT-460](../_archive/debt/debt-460-dependency-train-residues.md) (standing dependency-train rules)

---

## Problem

On 2026-09-15 the repository's Dependabot page listed 13 open alerts. Dependabot evaluates alerts against the **default branch's** manifest and lockfile, so every alert was computed from `main` at `54623ec1` (promo #874), which still carried `next@16.3.1`, `sharp@0.35.3`, `fast-uri@3.1.5`, `js-yaml@3.15.1`, `stream-json@1.9.1`, and `vitest`/`@vitest/mocker@4.1.10`.

PR #882 had already merged to `dev` (`c64cb986`, 2026-09-15T15:54Z) with `next` 16.3.1 → 16.3.4 and the `sharp` override 0.35.3 → 0.35.4, but touched none of the other four packages. The question was therefore answerable only per package, by comparing each alert's `first_patched_version` (from the Dependabot REST API, not the summary page) against `dev`'s resolved lockfile versions.

The full alert data was pulled with:

```sh
gh api --paginate 'repos/The-Obstacle-Is-The-Way/naltrexone-university/dependabot/alerts?state=open&per_page=100' \
  --jq '.[] | "#\(.number) \(.security_advisory.severity) \(.dependency.package.name) scope=\(.dependency.scope) manifest=\(.dependency.manifest_path) range=\(.security_vulnerability.vulnerable_version_range) patched=\(.security_vulnerability.first_patched_version.identifier) \(.security_advisory.ghsa_id)"'
```

## Findings

### Alert-by-alert disposition

| Alert | Package (scope) | Advisory | Severity / CVSS 3.1 | Vulnerable → patched | `main` @ #874 | `dev` @ #882 | Disposition |
|---|---|---|---|---|---|---|---|
| #61, #62 | `next` (runtime, direct) | GHSA-p293-qw3h-jr36 / CVE-2026-75604 — unauthenticated RCE on Windows-hosted servers | Critical / 9.0 | `>=16.0.0 <16.3.3` → 16.3.3 | 16.3.1 | **16.3.4** | **Closed by #882 → #886.** Auto-marked `fixed` 2026-09-15T16:05:17–18Z, five to six seconds after #886 merged (`8f98e234`). |
| #59, #60 | `next` (runtime, direct) | GHSA-2xp9-vwfh-vxw4 — unauthenticated RCE in Image Optimization when AVIF files are used | Critical | `>=16.0.0 <16.3.3` → 16.3.3 | 16.3.1 | **16.3.4** | **Closed by #882 → #886** (`fixed` 16:05:17–18Z). The #882 `sharp` override comment already records why 16.3.4 + sharp 0.35.4 is the coherent pair. |
| #58 | `sharp` (runtime, transitive via `next`; exact override) | GHSA-rgj7-g3m4-5g8c — bundled libheif flaws GHSA-g89c-p67h-r497 + GHSA-2jg2-4ch7-h545 | High | `<0.35.4` → 0.35.4 | 0.35.3 | **0.35.4** | **Closed by #882 → #886** (`fixed` 16:05:18Z). |
| #51, #52, #53, #54 | `fast-uri` (runtime, transitive; exact override) | GHSA-5jgf-p345-68v8, GHSA-fph4-wmhf-6fwf, GHSA-f65p-4m7j-42xc, GHSA-jqff-g426-hqxp — host confusion / SSRF via IDN, percent-decoding, IPv6, percent-encoded scheme | High / 7.5 (I:H) each | `>=3.0.0 <3.1.6` → 3.1.6 | 3.1.5 | 3.1.5 | **Fixed 2026-09-16T12:56:46Z after promo #889** (override 3.1.5 → 3.1.7, #888). See C. |
| #63 | `js-yaml` (runtime, transitive; exact override) | GHSA-2883-xcg3-v3hh / CVE-2026-84375 — `maxTotalMergeKeys` does not bound CPU for empty merge sources | High / 7.5 (A:H) | `>=3.0.0 <3.15.2` → 3.15.2 | 3.15.1 | 3.15.1 | **Fixed 2026-09-16T12:56:46Z after promo #889** (override 3.15.1 → 3.15.2, #888). See D. |
| #56, #57 | `@vitest/mocker`, `vitest` (development; `vitest` direct) | GHSA-82fw-gwwq-j7x9 / CVE-2026-84373 — path traversal / arbitrary file read via redirect mock | Moderate / 5.9 | `>=2.1.0 <4.1.11` → 4.1.11 | 4.1.10 | 4.1.10 | **Fixed 2026-09-16T12:56:46Z after promo #889** (4.1.11; caret floors `^4.1.7` → `^4.1.11`, #888). See E. |
| #55 | `stream-json` (runtime, transitive) | GHSA-528h-pc64-c93x / CVE-2026-71429 — `pick/ignore/filter/replace` filters are O(depth²) on nested input (DoS) | Moderate / 6.2 (AV:L, A:H) | `<=3.4.0` → 3.5.0 | 1.9.1 | 1.9.1 | **Dismissed `not_used` 2026-09-16T13:45:31Z on owner approval.** Unreachable; upstream-blocked two majors away; not closable by a pin. See F and the post-promotion receipts. |

At the original filing, **5 of 13 were closed by the Dependabot batch** (all four Critical alerts plus the sharp High). **8 remained**, in four packages. Three were mechanical same-line bumps that cleared the 7-day maturity gate without an exception; the fourth required an owner decision. The completed September 16 disposition is recorded below; these are not current open-alert counts.

### A–B. `next` and `sharp` — nothing left to do

Both alerts resolved by promotion. Dependabot's own security PR #879 (`next` 16.3.1 → 16.3.3, targeting `main` directly under the security-only config entry) is superseded by 16.3.4 and should be left for Dependabot to auto-close; per the update protocol it must not be merged (it bypasses `dev`) or run locally (DEBT-474 F1).

### C. `fast-uri` ×4 — override bump 3.1.5 → 3.1.7

**Chain (from `pnpm why fast-uri` on `dev`):** `fast-uri@3.1.5` ← `ajv@8.20.0` ← `ajv-formats` / `ajv-keywords` / `schema-utils@4.3.3` ← `webpack@5.105.0` / `terser-webpack-plugin` ← `@sentry/bundler-plugins@10.70.0` ← `@sentry/webpack-plugin@5.4.0` ← `@sentry/nextjs@10.70.0` (direct). `ajv` declares `fast-uri: ^3.0.1`. This is the Sentry **webpack** plugin's schema-validation path; the build runs under Turbopack, so the code is installed but not executed (issue #703 precedent recorded on the existing override comment).

**Version selection.** From the fastify/fast-uri release notes:

- 3.1.6 (2026-08-23) fixes exactly the four alerted advisories.
- 3.1.7 (2026-09-02) fixes two further High advisories not yet in the global GitHub Advisory Database (GHSA-qw65-cvwx-89v3 authority injection via unvalidated port in `serialize()`; GHSA-58mr-gqgx-xq4g host confusion via unbalanced IP-literal brackets). Published 13 days before this triage — past the 7-day gate.
- 3.1.8 (2026-09-15T07:36Z) fixes one Medium advisory (GHSA-hrr3-gc8f-f4qj inconsistent host case normalization). Eight hours old at triage time; ages in at **2026-09-22T07:36Z**.

Pin **3.1.7**: it closes the four alerts, pre-empts two future High alerts, satisfies `ajv`'s `^3.0.1`, is an upgrade (no-downgrade safe), and needs no maturity exception. 3.1.8 is deliberately not taken through a `minimumReleaseAgeExclude`: the playbook reserves that mechanism for urgent fixes, and a Medium-severity flaw on a non-executed build path is not urgent. **Follow-up:** move the pin to 3.1.8 (or the current 3.x) in the first dependency PR after 2026-09-22.

### D. `js-yaml` — override bump 3.15.1 → 3.15.2

**Chains:** (1) `gray-matter@4.0.3` (direct) → `js-yaml` — frontmatter parsing in seed/build scripts over first-party question markdown; (2) `@istanbuljs/load-nyc-config@1.1.0` ← `babel-plugin-istanbul` ← `babel-jest` / `@jest/transform` ← `react-native@0.84.1` ← the Solana mobile wallet-adapter packages ← `@clerk/ui@1.32.2` (direct) — test tooling for a React Native stack this Next.js app never executes. Both consumers declare `^3.13.1`. Same reachability as the [2026-06-29 worked example](../dev/supply-chain-overrides.md#worked-example-js-yaml-cve-2026-53550-2026-06-29): no attacker-supplied YAML is parsed anywhere; the pin is defense-in-depth that also clears the alert.

`3.15.2` is the `v3-legacy` dist-tag (published 2026-08-26T20:53Z, 19 days old) — no exception needed. It is the third retarget of this override (3.15.0 → 3.15.1 for alert #46 → 3.15.2 for #63); the "historical snapshot" note in the playbook is updated in the same PR so it stays truthful.

### E. `vitest` / `@vitest/mocker` — bump 4.1.10 → 4.1.11 (caret floors `^4.1.7` → `^4.1.11`)

Development scope. The advisory is a path-traversal in `@vitest/mocker`'s redirect-mock handling; 4.1.11's fix is "Restrict redirect mocks to the fs allowlist" (vitest-dev/vitest#10974). The exposure model needs a hostile test file or a mock pointed outside the project, which is not a threat this repository's own suites present — but 4.1.11 is a 28-day-old patch inside the declared `^4.1.7` range, so there is no reason to carry the alert.

The bump is done with `pnpm update vitest @vitest/browser-playwright @vitest/coverage-v8`, which raises the three caret floors in `package.json` from `^4.1.7` to `^4.1.11` and must move the four-package family in lockstep because `@vitest/browser-playwright` and `@vitest/coverage-v8` peer-pin `vitest` **exactly** (`4.1.11`), and `@vitest/mocker` is an exact dependency of `vitest`. `vite` stays at its exact `8.2.2` pin (vitest 4.1.11 peer range `^6 || ^7 || ^8`). The floor raise is kept deliberately: it is what a Dependabot security PR does, it changes nothing that is installed, and it stops a fresh resolve of the manifest from ever admitting the vulnerable 4.1.7–4.1.10 range.

4.1.11 also carries three non-security backports — global concurrency limit for the test lifecycle revived (#10992), browser tester iframe id encoding (#10955), and a Playwright/Chromium GC trigger on low disk (#10951) — so the **browser lane is load-bearing evidence** for this bump, not just the unit lane. Vitest 5.0.x is `latest` on npm; it is a dev-tooling major and stays out of scope per the update protocol.

### F. `stream-json` — no closable pin; unreachable; upstream-blocked

**Chain:** `stream-json@1.9.1` ← `jayson@4.3.0` (declares `^1.9.1`) ← `@solana/web3.js@1.98.4` (declares `jayson: ^4.1.1`) ← `@solana/wallet-adapter-react@0.15.39` / `@solana/wallet-adapter-base@0.9.27` / `@solana/wallet-standard@1.1.4` (all **exact-pinned** dependencies of `@clerk/ui@1.32.2`, direct). This is Clerk's Web3 wallet sign-in support; no Web3 strategy is configured in application code (this does not assert Clerk Dashboard configuration).

**Why an override cannot fix it.** The patched line starts at `stream-json@3.5.0`: `"type": "module"` (ESM-only), `engines.node >=22`, `stream-chain ^4.2.5`, with **renamed entry points**. `jayson@4.3.0` — still the latest release — is CommonJS and requires `stream-json/streamers/StreamValues` and `stream-json/utils/Verifier` (paths that no longer exist in v3) from `lib/utils.js`. Forcing `stream-json: 3.5.0` through `pnpm.overrides` would therefore turn every `require` of `jayson/lib/utils.js` into `MODULE_NOT_FOUND` — the opposite of defense-in-depth — while also being a two-major, out-of-range override, which the playbook has never allowed (the one out-of-range override, `postcss`, stays inside its major). Upstream is aware: tedeh/jayson#241 (opened 2026-09-14, "fix!: patch stream-json/uuid advisories … require Node >= 22") moves jayson to `stream-json ^3.5.0` as a **breaking** release. Even after it ships, `@solana/web3.js`'s `^4.1.1` range cannot take a jayson major, and `@clerk/ui` pins its adapter versions exactly, so the fix reaches this lockfile only after three upstream releases.

**Why it is not reachable.** Verified against the installed tree (`node_modules/.pnpm/jayson@4.3.0_*/node_modules/jayson`):

1. `@solana/web3.js` imports **only** `jayson/lib/client/browser` (all three builds: `index.cjs.js`, `index.esm.js`, `index.browser.cjs.js`).
2. `jayson/lib/client/browser/index.js` requires `uuid` and `../../generateRequest`; `generateRequest.js` requires only `uuid`. Neither loads `lib/utils.js`, which is the sole file that imports `stream-json`.
3. Even `lib/utils.js` uses only `StreamValues.withParser()` and `Verifier` (server/TCP request-stream parsing). The advisory is about the `pick`/`ignore`/`filter`/`replace` filter streams, which jayson never imports.
4. The advisory vector is `AV:L` (local); the only Node processes that could load these modules are the Next.js server/build and the repository scripts, and none of them constructs a jayson server, TCP client, or stream parser.

So the vulnerable functions are not merely unexecuted — they are not on any import path the application can take. The parallel jayson `uuid` advisory (GHSA-w5hq-g745-h8pq) is already covered by the existing `uuid: 14.0.0` override.

**Disposition.** Dismiss alert #55 with reason `not_used` and a comment pointing at this section, and re-check when (a) jayson publishes the #241 major, (b) `@solana/web3.js` or a successor adopts it, and (c) `@clerk/ui` picks that up — or when the Solana adapter tree leaves the lockfile entirely. The owner gave the go-ahead on 2026-09-16 and the alert was dismissed the same day (13:45:31Z) after an independent re-verification of items 1–3 against the installed tree (post-promotion receipts below); this document remains the standing rationale. Do not add a `pnpm audit` `ignoreGhsas` entry: CI does not run `pnpm audit`, and the playbook forbids proactive ignores.

### Observation (out of scope): the Solana/React Native tree

`stream-json` via jayson and an additional `js-yaml` path via react-native/jest tooling enter the lockfile because `@clerk/ui` hard-depends on the Solana wallet-adapter stack, which in turn drags in `react-native@0.84.1`, `babel-jest`, `@solana/web3.js`, and `jayson`. `js-yaml` also enters through `gray-matter` (§D), independently of Clerk. With no Web3 strategy configured in application code, the unused Solana stack adds attack surface and lockfile mass. Worth a future check of whether Clerk offers an adapter-free build or a peer/optional arrangement; it must **not** be attacked with stub-package overrides, which would silently break Clerk's sign-in bundle if a Web3 strategy were ever enabled.

## Remediation (single repo-owned PR to `dev`)

1. `pnpm-workspace.yaml`: `fast-uri: 3.1.5` → `3.1.7`; `js-yaml: 3.15.1` → `3.15.2`. Comments rewritten to carry the advisory ids, publish dates, and the 3.1.8 follow-up. No `minimumReleaseAgeExclude` block is introduced.
2. `pnpm update vitest @vitest/browser-playwright @vitest/coverage-v8` → lockfile moves `vitest`, `@vitest/mocker`, `@vitest/browser-playwright`, `@vitest/coverage-v8` (and the `@vitest/*` internals) to 4.1.11; the three `package.json` caret floors move `^4.1.7` → `^4.1.11`; `vite` stays `8.2.2`.
3. `pnpm install` to apply the overrides; `pnpm why fast-uri js-yaml vitest @vitest/mocker` must show only the target versions. Two incidental lockfile moves ride along and are accepted as disclosed: `@vitest/browser@4.1.11` re-resolves its `ws` range onto the already-present 8.21.3, so the duplicate `ws@8.21.0` entry disappears (one package fewer); and `browserslist@4.28.9` re-resolves `electron-to-chromium` 1.5.422 → 1.5.423 (published 2026-09-08, cleared the strict 7-day gate; data-only). Nothing else in the lockfile changes.
4. Docs: this record; `docs/debt/index.md` (Latest stanza, Active row, Next Debt ID → DEBT-477); the playbook's js-yaml historical note.
5. Full gate per the dependency-update protocol — `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm db:test:up && pnpm test:integration && pnpm build`, then `pnpm test:e2e` (mandatory for repo-owned dependency PRs; receipt in the PR body).
6. After promotion: #51–#54, #56, #57, #63 flipped to `fixed` at 2026-09-16T12:56:46Z; #55 dismissed on owner approval at 13:45:31Z (post-promotion receipts below).
7. Follow-up ticket-in-place: `fast-uri` 3.1.8 after 2026-09-22T07:36Z.

## Verification commands

```sh
# Alert state after promotion (expect fixed for 51-54, 56, 57, 63; open or dismissed for 55)
for n in 51 52 53 54 55 56 57 63; do gh api "repos/The-Obstacle-Is-The-Way/naltrexone-university/dependabot/alerts/$n" --jq '"#\(.number) \(.state) \(.dependency.package.name)"'; done

# Resolved versions on the branch (expect exactly one version each)
pnpm why fast-uri | head -1; pnpm why js-yaml | head -1; pnpm why vitest | head -1; pnpm why @vitest/mocker | head -1

# Override lines
grep -nE "^\s+(fast-uri|js-yaml): " pnpm-workspace.yaml

# No maturity exception was introduced
grep -c minimumReleaseAgeExclude pnpm-workspace.yaml   # expect 0

# stream-json reachability (expect only jayson/lib/utils.js, and no utils require from the browser client)
grep -rn "stream-json" node_modules/.pnpm/jayson@4.3.0*/node_modules/jayson/lib
grep -n "require(" node_modules/.pnpm/jayson@4.3.0*/node_modules/jayson/lib/client/browser/index.js
```

## Verification receipts (2026-09-15, local, PR head)

| Lane | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` (Biome 1191 files, `--error-on-warnings`; `lint:doubles` `issues=0`) | exit 0 |
| Unit | `pnpm test --run` | 462 files / 4243 tests passed, 32.45 s |
| Browser (vitest 4.1.11, Chromium 1243) | `pnpm test:browser` | 64 files / 398 tests passed, 56.25 s |
| Integration | `pnpm db:test:up` → migrate → seed (`SEED_INCLUDE_PLACEHOLDERS=true`, 958 files) → `pnpm test:integration` | 40 files passed + 2 opt-in Stripe provider lanes skipped; 258 tests passed / 6 skipped, 25.57 s |
| Build | `pnpm build` | 23/23 routes, exit 0 |
| E2E | `pnpm test:e2e` (isolated per-clone DB; Clerk + Stripe test mode) | 43 passed / 0 failed / 0 skipped, 3.9 min, exit 0 |
| Resolution | `pnpm why` | `fast-uri@3.1.7`, `js-yaml@3.15.2`, `vitest@4.1.11`, `@vitest/mocker@4.1.11`, `@vitest/browser-playwright@4.1.11`, `@vitest/coverage-v8@4.1.11`, `stream-json@1.9.1` — one version each |
| Peers | `pnpm peers check` | only the pre-existing `ws@7.5.13` ↔ `utf-8-validate` warning (Solana tree), identical on `dev` |

Local-environment note: the first browser-lane run failed with `Executable doesn't exist at …/chromium-1243/…` because Playwright 1.62.1 → 1.63.0 landed in #882 (`d6156d5a`) and this clone's `~/Library/Caches/ms-playwright/` still held only the 1.62.x build. `pnpm exec playwright install chromium` — the same step CI runs from `scripts/ci/install-playwright-chromium.sh` — fixed it; unrelated to this change, but every other clone on current `dev` will hit it once.

## Post-promotion receipts (2026-09-16)

Promotion #889 merged `dev` → `main` at `3aecbcdb` on 2026-09-16T12:56:39Z. Main CI run [35098807874](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35098807874) was created at 12:56:42Z and concluded successfully at 13:07:39Z (`test` completed at 13:07:31Z; `deploy` at 13:07:38Z). The run's creation time is not its success time. Alert states from the Dependabot REST API afterwards:

| Alert | Package | State | Timestamp |
|---|---|---|---|
| #51, #52, #53, #54 | `fast-uri` | `fixed` | `fixed_at` 2026-09-16T12:56:46Z |
| #63 | `js-yaml` | `fixed` | `fixed_at` 2026-09-16T12:56:46Z |
| #56, #57 | `@vitest/mocker`, `vitest` | `fixed` | `fixed_at` 2026-09-16T12:56:46Z |
| #55 | `stream-json` | `dismissed`, reason `not_used` | `dismissed_at` 2026-09-16T13:45:31Z, owner account, 258-character comment pointing at §F |

Twelve of the original thirteen alerts are `fixed` (five via #886, seven via #889); the thirteenth carries the owner-approved dismissal. The dismissal followed the owner's 2026-09-16 go-ahead and an independent re-verification of §F against the installed tree: `jayson/lib/utils.js` is the only `stream-json` importer; `jayson/lib/client/browser/index.js` requires only `uuid` and `../../generateRequest`; `@solana/web3.js` imports only `jayson/lib/client/browser`; and `stream-json@3.5.0` is `"type": "module"`, `engines.node >=22`, with `exports` limited to `./src/*`, so the `streamers/StreamValues` and `utils/Verifier` paths jayson requires do not exist there. GitHub retains the reason and comment, and the alert can be reopened if any §F recheck trigger fires.

## Separate dependency follow-through (2026-09-16)

The alert remediation above is distinct from the two routine dependency PRs. Stripe #890 merged to `dev` as `e8a9e5b3`, superseding #877, after CodeRabbit approved exact head `7132a2eb` at 16:33:13Z with zero unresolved threads; CI run 35119290492, Codecov patch, and Vercel passed. Its final commit corrected documentation only. The Sentry/Lucide batch and combined promotion remain pending; their eventual receipts belong in their PRs rather than being asserted before they happen.

`pnpm update @sentry/nextjs lucide-react` resolved Sentry 10.70.0 → 10.74.0 and Lucide 1.42.0 → 1.43.0. Manifest caret floors move `^10.53.1` → `^10.74.0` and `^1.16.0` → `^1.43.0`. npm timestamps establish seven-day eligibility at **2026-09-16T15:54:05.502Z** for Sentry and **2026-09-15T12:08:50.663Z** for Lucide; no age-gate or override policy changed.

- [Sentry 10.74.0](https://github.com/getsentry/sentry-javascript/releases/tag/10.74.0) fixes the jsdom/happy-dom import crash seen on #887's 10.73.0 head. The interval also defaults logs on in [10.71.0](https://github.com/getsentry/sentry-javascript/releases/tag/10.71.0), but this app uses neither `Sentry.logger` nor a log-forwarding integration; it does not opt into new log capture. [10.72.0](https://github.com/getsentry/sentry-javascript/releases/tag/10.72.0) removes transformer packages from server-utils, and [10.73.0](https://github.com/getsentry/sentry-javascript/releases/tag/10.73.0) adds a config entry point that this app does not use. Existing initialization and error-capture code is unchanged.
- [Lucide 1.43.0](https://github.com/lucide-icons/lucide/releases/tag/1.43.0) adds icons and adjusts the two ID-card icons; none of those changed icons is imported by this app.
- Disclosed transitive moves: `import-in-the-middle` 3.3.3 → 3.5.0, `cjs-module-lexer` 2.2.0 → 2.2.1, `es-module-lexer` 2.3.1 → 3.0.2; `schema-utils` 4.3.3 → 4.4.0 and its `ajv-formats` 2.1.1 → 3.0.1; Browserslist data `electron-to-chromium` 1.5.423 → 1.5.425 and `node-releases` 2.0.54 → 2.0.55. These are within their immediate consumers' declared ranges and cleared the age gate. Import-in-the-middle 3.5.0 explicitly adapts to lexer v3; schema-utils 4.4.0 explicitly adopts ajv-formats v3. No application consumer or override is forced across a major boundary.
- Sentry's old code-transformer/bundler-plugins/tracing-hooks subtree and its orphaned `astring`, `esquery`, `meriyah`, and `semifies` entries disappear. Runtime Sentry packages use core 10.74.0; the unchanged webpack-plugin 5.4.0 → bundler-plugins 10.70.0 path still pins a separate core 10.70.0. Do not claim one Sentry-core version or force-dedupe it. The OTel override trio stays 2.8.0; the sole peer warning remains the pre-existing Solana `ws@7.5.13` / `utf-8-validate` mismatch.

**Audit corrections:** The post-promotion CI timestamp above now distinguishes run creation from success; the Web3 statement is limited to application code; the Clerk observation no longer calls it the sole source of `js-yaml`; the #61/#62 timestamps preserve their one-second difference; and the register distinguishes merged alert remediation from pending dependency promotion. DEBT-476 stays Open for the dated `fast-uri` follow-up.

## Acceptance criteria

- `dev` lockfile resolves `fast-uri@3.1.7`, `js-yaml@3.15.2`, `vitest@4.1.11`, `@vitest/mocker@4.1.11`, `@vitest/browser-playwright@4.1.11`, `@vitest/coverage-v8@4.1.11`; `stream-json` stays `1.9.1` with the rationale above.
- `package.json` changes only the three vitest-family caret floors (`^4.1.7` → `^4.1.11`); `pnpm-workspace.yaml` gains no `minimumReleaseAgeExclude`.
- Full gate green on the PR head, including browser and E2E lanes; CodeRabbit review on the exact head.
- After promotion, the seven alerts this PR targets (#51–#54, #56, #57, #63) show `fixed` (**met 2026-09-16T12:56:46Z**), bringing the batch total to twelve of the original thirteen (five from #886 plus these seven); #55 carries an owner-approved `not_used` dismissal (**met 2026-09-16T13:45:31Z**).

## Risk and reversibility

- `fast-uri` and `js-yaml` moves are same-line patch releases within their consumers' declared ranges; revert = restore the two override lines and `pnpm install`.
- `vitest` family 4.1.10 → 4.1.11 is a patch with three behavioural backports (concurrency limit, browser iframe id, GC trigger); the browser lane is the detector. Revert = restore the three `package.json` lines and the lockfile, then `pnpm install --frozen-lockfile`.
- No production request path changes; no runtime code changes.

## Done when

- **Met 2026-09-16:** the remediation PR (#888) merged to `dev` and was promoted (#889); twelve of the thirteen alerts are `fixed` (five via #886, seven via #888), and #55 carries the owner-approved `not_used` dismissal.
- The `fast-uri` 3.1.8 follow-up has landed after 2026-09-22.
- This record moves to `docs/_archive/debt/` with the alert-state receipt.
