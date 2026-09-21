# Vercel CLI version boundary — 2026-09-20

Property: environment seeding must resolve the named Vercel database identity through the reviewed CLI, never silently execute whichever CLI npx discovers or downloads. The production command's refusal of caller-supplied `DATABASE_URL` is unchanged. No remote environment or database was touched in these proofs.

## Owner ruling and measured tradeoff

The September 20 owner ruling supersedes installing a devDependency: use an exact point-of-use download or require a verified preinstalled exact version. Keep the CLI outside the application's dependency graph and do not repair its transitive dependencies with repository overrides.

The earlier same-day installation experiment is recorded in `/private/tmp/codex-debt475-runtime.Xan40q/dependency-audit.md`: `vercel@59.16.0` added 264 lockfile package keys (199 packages installed on this platform). `pnpm audit --json` reported 20 advisories; only `stream-json@1.9.1` was already in the baseline. The other **19** all had Vercel dependency paths: one critical, eleven high, six moderate, one low. Critical `tar@7.5.7` came via `@vercel/fun` ([GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw); additional tar findings included [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m)). These are historical dependency-presence measurements, not an assertion that `env pull` executes each vulnerable path or that the CLI is harmless. The owner accepts that tooling risk outside application Dependabot alerts. Revisit if this CLI enters CI or the application runtime graph. No advisory was dismissed by this change.

Registry recheck at 2026-09-20 19:52Z: `pnpm view vercel time --json` still selects **59.16.0**, published **2026-09-11T08:45:02.967Z**, as the newest stable version at least seven days old. No age exemption is required.

## Why the preinstalled alternative

Real `pnpm dlx vercel@59.16.0 --version` exited 1 with `ERR_PNPM_TRUST_DOWNGRADE` for transitive `undici@5.29.0` under this repository's existing pnpm 11.3.0 policy. No CLI execution followed. The earlier application install had inherited existing application overrides; this isolated invocation does not justify repairing the vendor tree or weakening trust. [pnpm documents](https://pnpm.io/cli/dlx) point-of-use execution and the v11 trust/age checks; the actual installed command supplied the refusal receipt. No `allowBuilds`, `strictDepBuilds`, trust policy, manifest, or lockfile change is made here.

The runtime therefore invokes the preinstalled `vercel --version`, requires stdout to equal 59.16.0 after trimming, then invokes `vercel env pull` with the original environment and output path. Both commands are bounded by the existing five-minute timeout. stdout/stderr are captured; command failures emit a fixed, value-free diagnostic. stdin is closed: the CLI must already be installed and authenticated; seeding does not install, upgrade, or start an interactive login as a fallback. A failed pull cannot fall back to an older environment file.

This clone currently has global 59.23.2. The real runtime refuses it before environment pull; no global downgrade was performed because other sessions share that installation. **An operator must provision the reviewed exact version on PATH before either environment-seeding command can run.** Unit transport fixtures prove accepted-version delegation; this record does not claim a live 59.16.0 environment pull.

## Red-first proof

- The new seam tests first failed because the export did not exist; that is not claimed as a pin-behavior proof (`missing-seam-red.log`).
- With the seam exposed but npx and the absent version check retained, **10 of 17** runtime cases failed: three environment delegations, failure of the version command, five mismatched/malformed versions, and the direct executable boundary (`old-command-red.log`).
- After implementing the exact-version refusal, **30/30** cases passed across the runtime, production-target, and non-production-target suites (`focused-green.log`). The pre-existing caller-URL refusal and exact database-target consent tests remain unchanged.
- Tests exercise command errors without provider output, the existing timeout/signal, all three environment arguments, and read-after-pull ordering. The only module double is the permitted external Node child-process transport; no own-code mock, cast, skip, floor, or allowlist was added.

Local receipts: `/private/tmp/codex-vercel-pin.nfZag0/`. Full-gate, review, merge, and promotion results belong to their actual PR/run receipts, not these focused results. Main's #946 promotion ancestry is included on this feature branch so the later dev-to-main promotion can satisfy strict checks without a direct dev push.
