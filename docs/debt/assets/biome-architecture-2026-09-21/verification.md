# DEBT-475 architecture lint replacement — 2026-09-21

Base: promoted main `40d7c604`. Scope: tooling/configuration and documentation only; no application files, policy exceptions, size thresholds, retry settings, or fidelity floors change.

## Red before deletion

- At 03:13:37 UTC, the candidate real-Biome contract failed 23 cases against the previous configuration (38 passed across it and the existing architecture suite). Ordinary forbidden imports and invalid filenames were accepted. The existing scanner's synthetic contracts still passed.
- The replacement configuration rejected all formerly protected ordinary specifiers and filename cases, preserving the ten existing multi-dot exceptions. Installed Biome 2.5.12 still accepted two documented bypass fixtures: a template-literal dynamic import and `require('zod')`. Contrary to the candidate's assumption, Biome alone is not the whole import guard.
- At 03:19:08 UTC, four scanner regressions (both call forms in domain and application code) failed against the old scanner: 4 failed / 14 passed. The retained scanner now recognizes those literal call forms and applies the existing layer policy. It does not trace aliases, evaluate computed paths, or add a new threat model.
- After replacement: **68/68** focused cases passed (`architecture-lint-policy`, `architecture-boundaries`, `server-tracing-import-policy`). Real repository lint passed on 1,230 files. The existing Sentry boundary remains enforced; its five approved entry points are unchanged.

## Semantic checks retained and independently falsified

The existing semantic suite has 14 cases. Each temporary mutation was restored before the next probe:

| Mutation, UTC | Result |
| --- | --- |
| Remove resolved relative-target bans, 03:20:10 | 4 failed / 10 passed |
| Invert outer-layer type-only exception, 03:20:14 | 3 failed / 11 passed |
| Invert question-hook placement, 03:20:18 | 2 failed / 12 passed |
| Disable page-model naming, 03:20:22 | 1 failed / 13 passed |

These are guard tests, not product/E2E retries. No failed E2E run was repeated.

## Replacement boundary

Biome owns ordinary static/re-export/string-literal dynamic import restrictions and filename syntax. The scanner retains normalized local targets, outer-layer runtime-vs-type-only distinctions, literal calls the installed linter misses, question-hook placement, and page-model naming. The handwritten general filename collector, suffix parser, case converter, and exception table are removed. Existing filename exceptions live in the lint configuration rather than being broadened.

Sources: [Biome import rule](https://biomejs.dev/linter/rules/no-restricted-imports/javascript/), [filename rule](https://biomejs.dev/linter/rules/use-filenaming-convention/javascript/). The installed binary's executable receipts above take precedence over broader upstream capability descriptions.

## Release receipts

The first full gate stopped in unit tests: 2 failed / 4,493 passed. The raw-button harness's synthetic `*.probes.tsx` names correctly violated the new independent filename rule. Its actual-lint invocation now selects only `noRestrictedElements`, retaining all 13 button-scope assertions and the unchanged real repository configuration; the architecture suite tests filenames independently. No lint exception was added. The four combined focused suites then pass 81/81. Build, E2E, and push were not reached by the failed chain.

Full gate, hosted CI, exact-head review, merge, promotion, and production hold are pending. Focused proof is not a claim that this branch has shipped.
