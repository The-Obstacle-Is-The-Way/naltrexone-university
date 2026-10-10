#!/usr/bin/env bash
set -euo pipefail

# DEBT-516: CI's database image came from one registry, and on 2026-10-09
# Docker Hub refused it for half an hour, failing every pull request before
# any code ran. This starts CI's Postgres from the first of three registries
# that serves the pinned digest. A pull by digest checks the manifest and
# every layer against it, so each registry yields the same bytes.
registries=(
  docker.io/library/postgres
  public.ecr.aws/docker/library/postgres
  mirror.gcr.io/library/postgres
)
digest="${POSTGRES_IMAGE_DIGEST:-}"
pull_attempts=2
retry_delay_seconds="${POSTGRES_PULL_RETRY_DELAY_SECONDS:-10}"
health_checks="${POSTGRES_HEALTH_CHECKS:-60}"
health_interval_seconds="${POSTGRES_HEALTH_INTERVAL_SECONDS:-2}"
container=postgres

if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "::error::POSTGRES_IMAGE_DIGEST must be sha256: and 64 hex digits, not '${digest}'." >&2
  exit 2
fi

pull() {
  local image="$1"
  local attempt
  for ((attempt = 1; attempt <= pull_attempts; attempt++)); do
    if docker pull --quiet "$image"; then
      return 0
    fi
    if ((attempt < pull_attempts)); then
      echo "[start-postgres] Pull ${attempt} of ${pull_attempts} from ${image%%/*} failed; retrying in ${retry_delay_seconds}s."
      sleep "$retry_delay_seconds"
    fi
  done
  return 1
}

image=''
for registry in "${registries[@]}"; do
  if pull "${registry}@${digest}"; then
    image="${registry}@${digest}"
    break
  fi
  echo "::warning::Could not pull Postgres from ${registry%%/*}; trying the next registry."
done

if [[ -z "$image" ]]; then
  echo "::error::No registry served postgres@${digest}." >&2
  exit 1
fi
echo "::notice::Postgres image pulled from ${image%%/*}."

# The same database, credentials and health check the job's service
# container had; the job's DATABASE_URL points here.
docker run \
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
  "$image" > /dev/null

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
