# DEBT-516: CI Pulls Its Database Image from One Unauthenticated Registry

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — a promotion carries #1444 to `main`, and `main`'s scheduled hosted-checkout smoke pulls Postgres from the mirror; due 2026-10-16
**Priority:** P3
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** [#1444](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1444), merged to `dev` as `0035087b`; #1409's CI run 38001677286 pulled the mirror image and passed

---

## Summary

Every CI job that needs Postgres starts it as a GitHub Actions service container, before any step runs. Until #1444 the image came from Docker Hub without credentials. On 2026-10-09, from about 21:05Z, Docker Hub refused those pulls with `toomanyrequests: You have reached your unauthenticated pull rate limit`. The required `test` check then failed before any code ran on #1409 (run 37991221313, three attempts), #1436 (run 37993085470) and #1443 (run 37994066471), and no pull request could merge.

#1444 moved both workflows that run Postgres, `ci.yml` and `stripe-hosted-checkout-smoke.yml`, to Google's Docker Hub mirror at the same digest, and CI passed again. The image still comes from one registry, without credentials and without a fallback.

## Evidence

- **The documented exemption did not hold.** GitHub's [Actions limits](https://docs.github.com/en/actions/reference/limits) say that for GitHub-hosted runners pulling public images, "Docker Hub's rate limit is not applied". The failing jobs ran on GitHub-hosted `ubuntu-24.04` runners in the "GitHub Actions" runner group. Other public repositories reported the same failure in the same window, each opening an issue between 21:01Z and 21:09Z: [claudit#885](https://github.com/Nitjsefnie/claudit/issues/885), [golusoris#739](https://github.com/golusoris/golusoris/issues/739) and [vouchington#2653](https://github.com/vouchington/vouchington/issues/2653).
- **The limit.** Docker Hub's response headers give the anonymous limit as `ratelimit-limit: 100;w=3600`: 100 pulls per hour per address ([Docker's pull limits](https://docs.docker.com/docker-hub/usage/pulls/)). Hosted runners share addresses, so other tenants spend the same allowance.
- **Re-runs cannot help.** The runner retries a service-image pull three times within seconds, and attempts 2 and 3 of run 37991221313 failed the same way. A re-run also reuses the pull request's original merge commit and workflow file. After #1444 landed, each open pull request needed a `dev` merge and a push, not a re-run.
- **The pin is behind its tag.** The pinned `sha256:e17e86066e5ef83e0952a9347f5c792b7ece00972e2aa787a6986f471b3dd3d5`, set by BUG-327 on 2026-10-06, stopped being `postgres:16` at 2026-10-07T19:07:56Z. The tag now names `sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d`. Dependabot's `github-actions` ecosystem does not update `services.*.image`, so nothing refreshes the pin.
- **The mirror's documented and observed behaviour differ.** Google documents `mirror.gcr.io` as a cache of frequently requested Docker Hub images, says a direct pull fails without a cached copy, and says images no longer requested are removed ([pull cached Docker Hub images](https://docs.cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images)). Measured on 2026-10-09 at about 23:10Z, it served manifests for the pinned digest and for `postgres:16.0`, `16.4`, `16.8` and `16.10`. It also returned the config blob of the 2023 `16.0` image with a matching sha256. So it currently fetches old digests on demand, but that is observed, not documented, and it carries no availability commitment.
- **A second mirror holds the same digests.** Amazon ECR Public's Docker Official Images, `public.ecr.aws/docker/library/postgres`, served the pinned digest and the four older ones in the same check.
- **Prevention covers Postgres only.** `tests/ci-service-images.test.ts` requires every workflow's Postgres image to come from `mirror.gcr.io`, pinned by digest. It matches only image references containing `postgres`.
- **Local and CI differ.** `docker-compose.yml`, which serves the local integration and E2E databases, says it "Matches CI environment" but uses Docker Hub's moving `postgres:16` tag, not CI's digest.

## Impact

When the registry refuses or loses the image, every pull request's required `test` check fails before any code runs, and nothing merges. Production is unaffected, and the failure is loud, not silent. Retrying while the limit holds spends the shared allowance and fails again. A stale digest gives CI no Postgres 16 patch releases, and local runs can test a different patch level than CI.

## Options

1. **The mirror alone (#1444).** No secrets, so it works for Dependabot and fork pull requests too. It relies on behaviour Google does not document for direct pulls.
2. **Switch registries when the mirror fails.** Use `public.ecr.aws/docker/library/postgres` at the same digest: one line in each workflow plus the test's pattern. It has the same no-secret properties.
3. **Start Postgres in a step with a fallback chain.** Try the mirror, then ECR Public, then Docker Hub, all at one digest. That removes the single registry, but replaces GitHub's service-container start-up and health handling with repository code.
4. **Authenticated Docker Hub pulls.** Use `services.postgres.credentials` from a secret. That needs an owner-held Docker Hub token, plus a second copy as a Dependabot secret, because Dependabot runs read only those. Fork pull requests get neither.
5. **The repository's own GHCR copy.** It is owner-controlled and never evicted, but needs a write-capable copy workflow and a package to maintain.
6. **The runner image's preinstalled PostgreSQL.** No pull at all, but the version follows the runner image, not a pinned digest.

## Resolution (decided)

- **Now:** option 1, shipped in #1444. The digest pin, not the registry, guarantees the bytes, so changing registries changes only availability.
- **Prepared fallback:** option 2. At the first refused or missing pull from `mirror.gcr.io`, switch both workflows and the test to `public.ecr.aws` at the same digest, and record the event here. Turn to option 4 or 5 only if both public mirrors fail. Options 3 and 6 cost more than this loud, quickly reversible failure warrants.
- **Freshness and parity:** with each PostgreSQL 16 minor release, refresh CI's digest to the current `postgres:16`. The [roadmap](https://www.postgresql.org/developer/roadmap/) schedules the next for 2026-11-12. In the same pull request, pin `docker-compose.yml` to the same digest. Changing an image reference recreates each clone's local test database at its next start, which every gate re-migrates and re-seeds. The session taking the dependency update that follows a minor release owns this.
- **Prevention scope:** when a workflow adds any other service image, widen `tests/ci-service-images.test.ts` to every `image:` it declares.

Once `main` carries #1444 and its scheduled smoke pulls from the mirror, archive this record. The fallback and the freshness rule move to Deferred rows with the triggers above.

## Verification

- [x] #1444 is merged to `dev`, and #1409's CI run 38001677286 pulled `mirror.gcr.io/library/postgres@sha256:e17e86…` and passed (2026-10-09).
- [ ] A promotion carries #1444 to `main`, and `main`'s next scheduled Stripe hosted-checkout smoke pulls Postgres from the mirror.

## Related

- [BUG-327](../bugs/bug-327-dependabot-branches-build-with-preview-secrets.md): pinned every workflow's container images by digest.
- [Dependency update protocol](../dev/dependency-update-protocol.md): where the digest refresh joins the dependency queue.
