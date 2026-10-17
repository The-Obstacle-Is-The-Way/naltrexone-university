#!/usr/bin/env bash

# BUG-352: all CI images share bounded, explicit registry failover. Sourcing
# this file defines the function without changing the caller's shell options.
pull_image() {
  PULLED_IMAGE=''
  if (( $# < 4 )); then
    echo '::error::pull_image requires a label, digest and at least two repositories.' >&2
    return 2
  fi
  local label="$1" digest="$2"
  shift 2
  local digest_name
  digest_name="$(printf '%s' "$label" | tr '[:lower:]' '[:upper:]')_IMAGE_DIGEST"
  if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "::error::${digest_name} must be sha256: and 64 hex digits, not '${digest}'." >&2
    return 2
  fi
  local name="${1##*/}" repository attempt
  local pull_attempts=2 retry_delay_seconds=10
  local pull_timeout_seconds="${IMAGE_PULL_TIMEOUT_SECONDS:-60}"
  for repository in "$@"; do
    for ((attempt = 1; attempt <= pull_attempts; attempt++)); do
      if timeout --kill-after=10s "${pull_timeout_seconds}s" docker pull --quiet "${repository}@${digest}"; then
        PULLED_IMAGE="${repository}@${digest}"
        echo "::notice::${label} image pulled from ${repository%%/*}."
        return 0
      fi
      if ((attempt < pull_attempts)); then
        echo "[start-${name}] Pull ${attempt} of ${pull_attempts} from ${repository%%/*} failed; retrying in ${retry_delay_seconds}s."
        sleep "$retry_delay_seconds"
      fi
    done
    echo "::warning::Could not pull ${label} from ${repository%%/*}; trying the next registry."
  done
  echo "::error::No registry served ${name}@${digest}." >&2
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  if [[ "${1:-}" != --env || ! "${2:-}" =~ ^[A-Z][A-Z0-9_]*_IMAGE_REPOSITORY$ || -z "${GITHUB_ENV:-}" ]]; then
    echo '::error::Usage: pull-image.sh --env NAME_IMAGE_REPOSITORY label digest repository repository...; GITHUB_ENV is required.' >&2
    exit 2
  fi
  name="$2"
  shift 2
  pull_image "$@" || exit $?
  printf '%s=%s\n' "$name" "${PULLED_IMAGE%@*}" >> "$GITHUB_ENV"
fi
