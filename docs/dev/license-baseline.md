# License Baseline

**Last Reviewed:** 2026-05-25

This document records the production dependency license baseline for the app. It is a snapshot, not legal advice. The goal is to make future dependency/license drift visible during dependency hygiene work.

Regenerate with:

```bash
pnpm licenses list --prod --long --json
```

The raw JSON output includes absolute local `node_modules` paths, so the repo tracks the normalized distribution and review-worthy package names rather than committing the machine-local output verbatim.

---

## Scope

- Command: `pnpm licenses list --prod --long --json`
- Package manager: `pnpm@10.33.4`
- Runtime alignment: Node 24
- Dependency scope: production graph only (`--prod`)
- Total package records: 793

---

## Distribution

| License | Package records | Baseline policy |
|---|---:|---|
| MIT | 634 | Approved |
| Apache-2.0 | 72 | Approved |
| ISC | 39 | Approved |
| BSD-3-Clause | 18 | Approved |
| BSD-2-Clause | 8 | Approved |
| BlueOak-1.0.0 | 6 | Approved |
| FSL-1.1-MIT | 2 | Requires review |
| Unknown | 2 | Requires review; do not introduce new unknown-license packages |
| Unlicense | 2 | Approved |
| 0BSD | 2 | Approved |
| MPL-2.0 | 2 | Approved for current dependency graph; review before adding new direct dependencies |
| LGPL-3.0-or-later | 1 | Requires review |
| CC-BY-4.0 | 1 | Approved for metadata/data dependency only; review before adding runtime code dependencies |
| CC0-1.0 | 1 | Approved |
| (MIT OR Apache-2.0) | 1 | Approved |
| LGPL-3.0-only | 1 | Requires review |
| (MIT OR CC0-1.0) | 1 | Approved |

---

## Review-Worthy Entries

These entries are allowed in the current resolved tree, but any new direct dependency or material usage expansion under these licenses requires explicit review.

| License | Package | Version | Why allowed now | Policy |
|---|---|---:|---|---|
| FSL-1.1-MIT | `@sentry/cli` | 2.58.6 | Existing Sentry CLI tooling dependency. | Approved for current tree; review before adding new FSL packages. |
| FSL-1.1-MIT | `@sentry/cli-darwin` | 2.58.6 | Existing Sentry CLI platform binary. | Approved for current tree; review before adding new FSL packages. |
| LGPL-3.0-only | `rpc-websockets` | 9.3.9 | Transitive JSON-RPC/WebSocket package through the current dependency graph. | Requires review before direct use or new LGPL dependency additions. |
| LGPL-3.0-or-later | `@img/sharp-libvips-darwin-arm64` | 1.2.4 | Prebuilt libvips dependency used by `sharp` on macOS ARM. | Approved for current image-processing dependency; review before adding new LGPL packages. |
| Unknown | `eyes` | 0.1.8 | Transitive value-inspection utility in the current graph. | Do not add new unknown-license packages; replace if this becomes direct/runtime-critical. |
| Unknown | `text-encoding-utf-8` | 1.0.2 | Transitive UTF-8 Encoding API polyfill in the current graph. | Do not add new unknown-license packages; replace if this becomes direct/runtime-critical. |

---

## Operating Rules

1. Do not add a new direct dependency with `Unknown`, `FSL-*`, or `LGPL-*` licensing without explicit review.
2. If `pnpm licenses list --prod --long --json` introduces a new license bucket, update this baseline in the same dependency PR or file a dedicated follow-up.
3. If a package moves from a permissive license to a restricted or unknown license, treat that as a dependency-hygiene finding, not a routine patch.
4. This baseline does not enforce CI. A license allowlist check can be added later after this snapshot is accepted.

---

## Related

- [DEBT-392 Dependency Hygiene Audit](../debt/debt-392-dependency-hygiene-audit.md)
- [Deployment Procedure](./deployment-procedure.md)
