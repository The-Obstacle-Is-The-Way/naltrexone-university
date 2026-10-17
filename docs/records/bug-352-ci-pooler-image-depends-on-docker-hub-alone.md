# BUG-352: CI's Pooler Image Depends on Docker Hub Alone

**Status:** Open — pull CI's PgBouncer image with the failover Postgres has, and guard every image the workflows pull; due 2026-10-24
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

BUG-345's fix (#1549, promoted in #1551 on 2026-10-17) added a second container image to the required `test` job: PgBouncer, a transaction pooler standing in for Neon's. Compose pulls it by digest from Docker Hub alone, with no retry of its own and no other registry.

A week earlier, DEBT-516 removed exactly this single point of failure for Postgres, after Docker Hub refused CI's database image on 2026-10-09 and every pull request failed before any code ran. Its decided fix made the required check fail that way only if all three registries refused the digest. On `main` that is no longer true. If Docker Hub refuses or stalls, the `Start Postgres` step now falls back to another registry and passes, and the `Start transaction pooler` step then fails.

The gap was known before merging. It shipped as DEBT-516's last open item and as a known residual in #1549's description, with neither failover nor the owner's acceptance. DEBT-516's guard did not catch it, because the guard checks Postgres only.

## Evidence

- **The step.** `Start transaction pooler` runs `docker compose up --no-start --no-deps pgbouncer`. Compose pulls `edoburu/pgbouncer@sha256:7d7a27d9…` (`v1.25.2-p0`) from Docker Hub when the image is missing, and it has no retry option.
  - The step is bounded at 3 minutes, so a stalled pull fails it.
  - In `main`'s release run of 2026-10-17, `Start Postgres` logged `Postgres image pulled from docker.io`, and the PgBouncer pull then took about 3 seconds.
- **Who serves the pin (2026-10-17).**
  - Docker Hub and Google's `mirror.gcr.io` serve the pinned index. The sha256 of each served index body equals the pin, so a pull by digest gets the same image from either.
  - ECR Public, GHCR and Quay do not serve it.
  - The image is community-maintained (`edoburu/docker-pgbouncer` on GitHub), and no other registry checked publishes it.
  - So PgBouncer has two sources where Postgres has three, and Google's is a cache of Docker Hub. [Google's page on it](https://docs.cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images) gives "no guarantee that a particular image will remain cached". It also documents the mirror only through the Docker daemon's registry-mirror setting. A direct pull, which `start-postgres.sh` already makes, works today but is outside that documented use.
- **What fails it.**
  - On 2026-10-09, DEBT-516 recorded Docker Hub's authenticated requests failing. CI's pulls failed from 21:04Z to 21:35Z, some refused at the anonymous limit, and Docker's status page reported the incident.
  - GitHub's [Actions limits](https://docs.github.com/en/actions/reference/limits) say Docker Hub's rate limit "is not applied" to hosted runners pulling public images. They do not say how a step's own `docker pull` is credited.
  - Whichever path such a pull takes, it ends at Docker Hub's registry, so an outage there fails it.
- **Why the guard missed it.** `tests/ci-service-images.test.ts` requires failover for Postgres alone: every job with a local database must run `scripts/ci/start-postgres.sh` before its first `pnpm` step. Its other image checks read only the images a workflow declares: service containers, job containers and `docker://` steps.
  - An image that Compose pulls inside a `run` step is in neither.
  - The pooler test pins PgBouncer's digest, pool mode, ignored startup parameters and port. It does not pin where the image comes from.
- **The job's other downloads.** These were checked to bound this record's scope. PgBouncer is the only container image on the required path without failover.

  | Download | Source and handling |
  |---|---|
  | Actions and Node | GitHub |
  | Postgres | Three registries, with failover (DEBT-516) |
  | Playwright's Chromium and its apt packages | Playwright's installer rotates through three download hosts; `scripts/ci/install-playwright-chromium.sh` bounds it and retries apt through `archive.ubuntu.com` |
  | Codecov upload | `continue-on-error`, so it never fails `test` |
  | pnpm and every package | The npm registry. Vercel's build depends on it too: a different class, out of scope here |

- **Nothing refreshes the pin.** It is `v1.25.2-p0`. Upstream's repository moved to PgBouncer 1.26.0 on 2026-09-30, and Docker Hub has a `v1.26.0-p0` tag; its `latest` tag is a third digest. Dependabot has no Docker or Compose ecosystem here. The [dependency update protocol](../guides/dependencies/updating-dependencies.md) has a refresh section for CI's Postgres image but none for PgBouncer. So no duty refreshes the digest, or checks again which registries serve it.

## Impact

While Docker Hub refuses or stalls pulls, `test` fails at the pooler step after Postgres has started:
- every pull request, Dependabot's and forks' included;
- every promotion, since `scripts/verify-promotion.ts` requires `test`;
- every production release, since Vercel's Deployment Check keeps the production domain on the previous release until `main`'s `test` passes. A hotfix waits too.

Production keeps serving, and no data is at risk. Recovery is a re-run once Docker Hub serves again, so the outage's length bounds the delay: on 2026-10-09, CI's pulls failed for about half an hour, and Docker resolved its incident at 21:56Z. P3, as DEBT-516 was.

## Options

1. **Pull every image the workflows start through DEBT-516's failover.** This reuses a tested mechanism, needs no secrets, and works for Dependabot and fork pull requests. For PgBouncer, the failover is Docker Hub, then Google's mirror.
2. **Configure the runner's Docker daemon to use `mirror.gcr.io` as a registry mirror.** That is Google's documented use, and it covers every Docker Hub pull with no Compose change. The setting is one the daemon reloads without a restart, but it must be in place before the first pull. The daemon then prefers the mirror, so GitHub's exempt Docker Hub path is no longer first. A stalled mirror can use up a bounded pull before Docker Hub is tried. And it departs from DEBT-516's explicit, tested ordering.
3. **Retry Docker Hub only.** This covers a blip, but not an outage like the half hour on 2026-10-09.
4. **Add the owner's own GHCR copy as an independent third source.** This is DEBT-516's option 5. It is owner-controlled and runs on the runners' own platform. It costs a package, a copy step that can write, and a copy on every refresh.
5. **Keep the image in an Actions cache as a fallback** (`docker save`, keyed by digest). It is GitHub-hosted and needs no credential. But a cache entry unused for 7 days is evicted, and a loaded image may carry no registry digest, so the step would need its own integrity check of the image ID.
6. **Move the pooler suite to a job that is not required.** That takes the risk off the required path, but it makes BUG-345's only regression guard advisory.
7. **Accept the risk.** The guarantee DEBT-516 decided would stay broken, although the repository already has a tested mechanism for it.

## Resolution (proposed)

The proposal is option 1, with a guard that keeps every image the workflows pull on failover. Option 4 waits for evidence that the mirror is unreliable for this image.

- **One failover helper.**
  - Move `start-postgres.sh`'s pull loop into `scripts/ci/pull-image.sh`. Given a label, a digest and an ordered list of repositories, it pulls `<repository>@<digest>` from the first that serves it:
    - two attempts per registry, 10 seconds apart, each stopped at 60 seconds;
    - a log line `<label> image pulled from <registry>`, as a notice.
  - `start-postgres.sh` calls the helper with its three registries. Its behavior and its messages stay as they are, so `scripts/ci/start-postgres.test.ts` passes unchanged.
  - It hands back the reference it pulled without its caller capturing its output, for example as a sourced function that sets a variable. Captured output would swallow its notices.
- **PgBouncer through the helper.**
  - A new step, before `Start transaction pooler`, pulls the pin from `docker.io/edoburu/pgbouncer` and then `mirror.gcr.io/edoburu/pgbouncer`.
  - It writes the repository that served it to `$GITHUB_ENV` as `PGBOUNCER_IMAGE_REPOSITORY`.
  - The digest is the step's `PGBOUNCER_IMAGE_DIGEST`, as Postgres's is.
  - The step is bounded at 7 minutes. Refusing both registries takes at most 2 × (70 + 10 + 70) = 300 seconds.
- **Compose runs what was pulled.**
  - `docker-compose.yml`'s image becomes `${PGBOUNCER_IMAGE_REPOSITORY:-edoburu/pgbouncer}@sha256:7d7a27d9…`. The digest stays literal, and local use is unchanged.
  - The name has to vary because Docker cannot tag a digest reference. An image pulled from the mirror is known locally only by the mirror's name, so Compose must be given that name. Checked on 2026-10-17 with Docker 29.8: after a pull from the mirror, the same digest under its Docker Hub name is `No such image`, and `docker tag` refuses a digest reference.
  - Both `docker compose up` calls add `--pull never`, so Compose can never fall back to an unannounced Docker Hub pull.
- **The guard, red first.** It generalizes DEBT-516's guard from Postgres to every image a workflow pulls:
  - no workflow `run` step calls `docker pull`, `docker run`, `docker create` or `docker compose pull` directly; images come only through `scripts/ci/pull-image.sh`;
  - every `docker compose up`, `create` or `run` in a workflow passes `--pull never`;
  - each Compose service a workflow starts has an image of the form `${<NAME>_IMAGE_REPOSITORY:-<repository>}@sha256:<64 hex>`, whose digest equals the one the workflow pulls through the helper.

  Today's `ci.yml` fails the second and third rules.
- **A refresh duty.** Add a "CI's PgBouncer Image" section to the dependency update protocol:
  - **When:** refresh on a PgBouncer security release, or when the pooler behavior that BUG-345's suite models changes.
  - **How:** resolve the digest from Docker Hub's `edoburu/pgbouncer:<version>` tag only, and confirm each registry serves it with `docker buildx imagetools inspect --raw`.
  - **Where:** change the workflow's digest and `docker-compose.yml` together; the test keeps them equal.

  Whether to move to `v1.26.0-p0` is that duty's first decision, not this fix's.
- **Out of scope:**
  - the npm registry, which every install needs, Vercel's build included;
  - a clone's first local pull, which comes from Docker Hub once and is then cached.
- **The residual.** There are two sources. Google's mirror keeps only what it has cached, and a direct pull from it is outside Google's documented use, as it already is for Postgres.
  - If a refresh finds the mirror lacks the new digest, the refresh pull request says so.
  - If Docker Hub ever fails while the mirror lacks the digest, adopt option 4.

## Verification

- [ ] The guard fails on today's `ci.yml`, then passes with the fix.
- [ ] A test with a fake Docker CLI shows each of these:
  - the PgBouncer pull falls to the mirror when Docker Hub refuses or hangs;
  - Compose then runs the mirror's reference with `--pull never`;
  - the step fails with `No registry served` when both registries refuse.
- [ ] Locally, with the image removed and pulled from the mirror alone, Compose with `PGBOUNCER_IMAGE_REPOSITORY=mirror.gcr.io/edoburu/pgbouncer` and `--pull never` starts the pooler from the mirror's copy.
- [ ] The pull request's CI logs `PgBouncer image pulled from <registry>`, and the pooler suite passes.
- [ ] After promotion, `main`'s CI logs the notice for both images.

## Related

- BUG-345: its fix added this image to CI.
- DEBT-516: the failover this extends. It closed on 2026-10-17, and its open item for this image moved here.
- BUG-327: pinned every workflow image by digest.
