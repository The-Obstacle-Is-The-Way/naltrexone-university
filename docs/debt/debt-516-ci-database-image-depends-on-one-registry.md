# DEBT-516: CI's Database Image Depends on One Registry

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — decided below: CI pulls Postgres with automatic failover across three registries at one digest; until then #1444's mirror serves it
**Priority:** P3
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** [#1444](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1444), promoted in #1445

---

## Summary

CI starts Postgres as a GitHub Actions service container before any step runs. When that image cannot be pulled, the required `test` check fails with no code run, and no pull request can merge. On 2026-10-09 this happened for about an hour, on #1409, #1436 and #1443. Docker's own status page reports the incident "Hub Registry Authenticated Actions Failing" for the same evening.

GitHub-hosted runners pull from Docker Hub as an authenticated `githubactions` account, and that is how GitHub exempts them from Docker Hub's anonymous limit. When the authenticated requests failed, the pulls fell back to the anonymous limit and were refused.

#1444 moved both workflows that run Postgres to Google's `mirror.gcr.io` at the same digest, and CI passed again. #1445 carried the change to `main`. The image still comes from a single registry. Google documents that mirror for use through the Docker daemon's registry-mirror setting, not for the direct pulls the workflows now make. Recovering by hand took a pull request, a CodeRabbit slot, and a `dev` merge and push on every open pull request.

## Evidence

- **Failures.** Every failure was at "Initialize containers" on GitHub-hosted `ubuntu-24.04` runners, between 21:04Z and 21:35Z: three attempts on #1409, one on #1436 and two on #1443. The run IDs are in #1409's and this record's pull-request descriptions. The logs show three kinds of failure:
  - the runner fetching registry tokens as `account=githubactions`;
  - `context deadline exceeded` and failed `GET` requests to `registry-1.docker.io`;
  - `toomanyrequests: You have reached your unauthenticated pull rate limit`.

  Three other public repositories reported the same failure between 21:01Z and 21:09Z: [claudit#885](https://github.com/Nitjsefnie/claudit/issues/885), [golusoris#739](https://github.com/golusoris/golusoris/issues/739) and [vouchington#2653](https://github.com/vouchington/vouchington/issues/2653).
- **Docker's incident.** [Docker's status page](https://www.dockerstatus.com/incidents/01M4HA1E00AH6NXA276AW0CK2V) lists "Hub Registry Authenticated Actions Failing", a partial outage of the Docker Hub Registry. It was identified at 21:45Z: "All registry traffic for authenticated requests are sending back a 500". A fix was applied at 21:52Z and the incident was resolved at 21:56Z. The failures here began 40 minutes before it was identified.
- **The exemption.** GitHub's [Actions limits](https://docs.github.com/en/actions/reference/limits) say that for GitHub-hosted runners pulling public images, "Docker Hub's rate limit is not applied". The `githubactions` token is how that exemption works, so it depends on Docker Hub's authenticated path.
- **The anonymous limit.** Docker's [pull limits](https://docs.docker.com/docker-hub/usage/pulls/) give 100 pulls per 6 hours per IPv4 address or IPv6 /64. On 2026-10-09 the live response headers reported `ratelimit-limit: 100;w=3600`, which is 100 per hour. Hosted runners share addresses.
- **Retries.** The runner retries a service-image pull three times within seconds, and all three failed while the incident lasted. A re-run reuses the run's merge commit and workflow file. So after #1444 merged, each open pull request needed a `dev` merge and a push to pick it up.
- **The pin.** The workflows pin `postgres@sha256:e17e86066e5ef83e0952a9347f5c792b7ece00972e2aa787a6986f471b3dd3d5`.
  - It was introduced on 2026-08-20 in the hosted-checkout smoke workflow and its test ([DEBT-471](../_archive/debt/debt-471-e2e-ci-external-fragility.md)'s review fixes). BUG-327 copied it into `ci.yml` on 2026-10-06.
  - `postgres:16` has been rebuilt since, and now names `sha256:ca0bd484…`, built 2026-10-06. Both images are PostgreSQL 16.15 (`PG_VERSION=16.15-1.pgdg13+2`), so CI has missed no Postgres patch. Only the Debian base layers differ.
  - Dependabot updates neither `services.*.image` nor `docker://` references, so nothing refreshes the pin.
- **The mirror.** Google's [page on cached Docker Hub images](https://docs.cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images) says: "Only obtain cached images on mirror.gcr.io by configuring the Docker daemon". It also says "there is no guarantee that a particular image will remain cached for an extended period of time."
  - Measured on 2026-10-09, the mirror served the pinned digest and the digests of `postgres:16.0`, `16.4`, `16.8` and `16.10`.
  - It returned the 2023 `16.0` image's config blob, and the blob's sha256 matched.
  - So direct pulls work today, but they are outside the mirror's documented use.
- **ECR Public.** Amazon ECR Public's Docker Official Images, `public.ecr.aws/docker/library/postgres`, served the same digests. AWS documents its own [quotas](https://docs.aws.amazon.com/AmazonECR/latest/public/public-service-quotas.html) for unauthenticated pulls: 1 pull per second per Region and 500 GB of data a month, neither adjustable. So it is another anonymous source with limits, but a different failure domain.
- **Integrity.** For a pull by digest, Docker checks the manifest and each layer against their digests. So any registry that serves the pinned digest serves the same bytes, provided the digest was first resolved from Docker Hub.
- **Guards.** `tests/ci-service-images.test.ts` checks only image references containing `postgres`. `tests/ci-workflow.test.ts` pins the full mirror reference.
- **Local parity.** `docker-compose.yml` says it "Matches CI environment", but it uses Docker Hub's moving `postgres:16` tag. Compose never pulls a newer copy of that tag, so each clone keeps whatever it pulled first.

## Impact

While the image cannot be pulled, every pull request's required `test` check fails before any code runs, and nothing merges. Production is unaffected and the failure is loud. Recovery by hand is bounded by the review queue, not the code change: on 2026-10-09 it took about an hour and a half. Locally, a clone can test against a different Postgres 16 build from CI's.

## Options

1. **The mirror alone (#1444).** It works today and needs no secrets. But it is outside Google's documented use, and Google gives no guarantee of cache retention.
2. **Switch the single registry when it fails.** Move to Docker Hub or ECR Public at the same digest. Each switch is the same hand-made recovery as 2026-10-09.
3. **Pull with automatic failover.** Start Postgres in a step that pulls the pinned digest from Docker Hub, then ECR Public, then `mirror.gcr.io`, and runs it with the service container's health check. That covers three independent failure domains, with no secrets and the same bytes, and it works for Dependabot and fork pull requests too. The cost is that a short script replaces GitHub's service-container start-up, and CI exercises it on every run.
4. **Authenticated Docker Hub pulls** through `services.postgres.credentials`. These need an owner-held token and a second copy as a Dependabot secret, and fork pull requests get neither. On 2026-10-09 the authenticated path is what failed.
5. **The repository's own GHCR copy.** It is owner-controlled and runs on the runners' own platform. It needs a write-capable copy workflow, a package, and a copy step on every refresh.
6. **The runner image's preinstalled PostgreSQL.** No pull at all, but the version follows the runner image rather than a pinned digest.

## Resolution (decided)

- **Option 3, in its own pull request.** This is the record's open work.
  - Pull from Docker Hub first, since it is GitHub's documented path, then `public.ecr.aws`, then `mirror.gcr.io`. Use the pinned digest throughout, retry briefly per registry, and log which registry served the image.
  - The same pull request:
    - widens `tests/ci-service-images.test.ts` to every image the workflows reference;
    - pins `docker-compose.yml` to the same digest, with a test that keeps the two equal;
    - adds the digest refresh below to the [dependency update protocol](../dev/dependency-update-protocol.md).
  - Option 4 is not adopted, because its authenticated path is what failed. Option 5 adds a package and a write credential for one image. Option 6 drops the pin.
- **Until option 3 lands,** keep #1444's mirror. If the mirror answers "manifest unknown", or keeps refusing across a re-run a few minutes later, switch both workflows and `tests/ci-workflow.test.ts` to Docker Hub or `public.ecr.aws` in one pull request.
- **Freshness.**
  - Resolve a new digest only from Docker Hub's `postgres:16` tag, never from a mirror's copy of the tag. Then confirm that every registry in the list serves it.
  - Refresh on each PostgreSQL 16 minor release, or on an advisory against the image. The [roadmap](https://www.postgresql.org/developer/roadmap/) names 2026-11-12 as the earliest date for the next release.
  - A rebuild that changes only the Debian base needs no refresh.
  - This record holds the duty until option 3's pull request writes it into the protocol.

## Verification

- [x] #1444 is merged and promoted in #1445, and `main`'s CI pulled Postgres from the mirror (2026-10-10).
- [ ] `main`'s next scheduled hosted-checkout smoke pulls Postgres from the mirror. The evidence is its "Initialize containers" log; the run's conclusion also depends on Stripe.
- [ ] Option 3's pull request merges and is promoted, and CI logs show the failover step pulling the pinned digest.
- [ ] `docker-compose.yml` pins CI's digest, and a test keeps the two equal.

## Related

- [DEBT-471](../_archive/debt/debt-471-e2e-ci-external-fragility.md): E2E and CI external fragility, which introduced the digest pin.
- [BUG-327](../bugs/bug-327-dependabot-branches-build-with-preview-secrets.md): pinned every workflow's container images by digest.
- [Dependency update protocol](../dev/dependency-update-protocol.md): where option 3's pull request adds the digest refresh.
