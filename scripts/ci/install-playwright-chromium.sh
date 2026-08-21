#!/usr/bin/env bash
set -euo pipefail

apt_root="${PLAYWRIGHT_APT_ROOT:-/etc/apt}"
primary_timeout_seconds="${PLAYWRIGHT_PRIMARY_DEPS_TIMEOUT_SECONDS:-180}"
fallback_timeout_seconds="${PLAYWRIGHT_FALLBACK_DEPS_TIMEOUT_SECONDS:-300}"
browser_timeout_seconds="${PLAYWRIGHT_BROWSER_TIMEOUT_SECONDS:-180}"
kill_after_seconds="${PLAYWRIGHT_KILL_AFTER_SECONDS:-15}"

run_bounded() {
  local timeout_seconds="$1"
  shift
  timeout \
    --signal=TERM \
    --kill-after="${kill_after_seconds}s" \
    "${timeout_seconds}s" \
    "$@"
}

find_apt_source_files() {
  find "$apt_root" \
    -type f \
    \( -name '*.list' -o -name '*.sources' \) \
    -print0 2>/dev/null
}

remove_microsoft_sources() {
  while IFS= read -r -d '' source_file; do
    if grep -qE 'packages\.microsoft\.com' "$source_file"; then
      if grep -qE '(azure\.archive\.ubuntu\.com|archive\.ubuntu\.com|security\.ubuntu\.com)' "$source_file"; then
        echo "[playwright-install] Preserving mixed Ubuntu/Microsoft source file: $source_file"
        continue
      fi
      sudo rm -f "$source_file"
    fi
  done < <(find_apt_source_files)
}

fail_over_azure_archive_sources() {
  local rewrote_source=false
  local replacement_file
  while IFS= read -r -d '' source_file; do
    if ! grep -q 'azure\.archive\.ubuntu\.com' "$source_file"; then
      continue
    fi

    replacement_file="$(mktemp)"
    sed \
      's/azure\.archive\.ubuntu\.com/archive.ubuntu.com/g' \
      "$source_file" > "$replacement_file"
    sudo cp "$replacement_file" "$source_file"
    rm -f "$replacement_file"
    rewrote_source=true
  done < <(find_apt_source_files)

  if [[ "$rewrote_source" == true ]]; then
    echo '[playwright-install] Retrying apt dependencies through archive.ubuntu.com.'
  else
    echo '[playwright-install] No Azure Ubuntu source was present; retrying the bounded apt phase once.'
  fi
}

remove_microsoft_sources

if ! run_bounded \
  "$primary_timeout_seconds" \
  pnpm exec playwright install-deps chromium; then
  echo '[playwright-install] Primary apt phase failed or timed out.'
  fail_over_azure_archive_sources
  run_bounded \
    "$fallback_timeout_seconds" \
    pnpm exec playwright install-deps chromium
fi

run_bounded \
  "$browser_timeout_seconds" \
  pnpm exec playwright install chromium
