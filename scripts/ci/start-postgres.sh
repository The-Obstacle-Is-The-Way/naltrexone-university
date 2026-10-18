#!/usr/bin/env bash
set -euo pipefail

# DEBT-516: CI's database image came from one registry, and on 2026-10-09
# Docker Hub refused it, failing every pull request before any code ran.
# This starts CI's Postgres from the first of three registries that serves
# the pinned digest. A pull by digest checks the manifest and every layer
# against it, so each registry yields the same bytes.
source "$(dirname "${BASH_SOURCE[0]}")/pull-image.sh"
IMAGE_PULL_TIMEOUT_SECONDS="${POSTGRES_PULL_TIMEOUT_SECONDS:-60}" pull_image Postgres "${POSTGRES_IMAGE_DIGEST:-}" \
  docker.io/library/postgres \
  public.ecr.aws/docker/library/postgres \
  mirror.gcr.io/library/postgres
image="$PULLED_IMAGE"
health_checks=60
health_interval_seconds=2
container=postgres

# The same database, credentials and health check the job's service
# container had; the job's DATABASE_URL points here.
if ! docker run \
  --detach \
  --name "$container" \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=addiction_boards_test \
  --publish 5432:5432 \
  --health-cmd 'pg_isready -U postgres -d addiction_boards_test' \
  --health-interval 5s \
  --health-timeout 5s \
  --health-retries 10 \
  "$image" > /dev/null; then
  echo "::error::Could not start Postgres from ${image}." >&2
  exit 1
fi

for ((check = 1; check <= health_checks; check++)); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  if [[ "$status" == healthy ]]; then
    echo '[start-postgres] Postgres is healthy.'
    exit 0
  fi
  if [[ "$status" == unhealthy ]]; then
    break
  fi
  sleep "$health_interval_seconds"
done

echo '::error::Postgres did not become healthy.' >&2
docker logs "$container" >&2 || true
exit 1
