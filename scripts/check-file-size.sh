#!/usr/bin/env sh

MAX_LINES=350
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

to_repo_relative() {
  rel_path="$1"

  case "$rel_path" in
    "$REPO_ROOT"/*)
      rel_path=${rel_path#"$REPO_ROOT"/}
      ;;
  esac

  case "$rel_path" in
    ./*)
      rel_path=${rel_path#./}
      ;;
  esac

  printf '%s\n' "$rel_path"
}

is_known_exempt() {
  case "$1" in
    db/schema.ts | \
      src/adapters/repositories/drizzle-attempt-repository.ts | \
      app/\(app\)/app/history/components/history-questions-tab.tsx | \
      app/\(app\)/app/practice/\[sessionId\]/practice-session-page-logic.ts | \
      app/\(app\)/app/questions/\[slug\]/question-page-client.tsx)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_test_file() {
  case "$1" in
    *.test.ts | *.test.tsx | *.spec.ts | *.spec.tsx)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_script_file() {
  case "$1" in
    scripts/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_root_config_file() {
  case "$1" in
    */*)
      return 1
      ;;
    *.config.* | *.mjs | *.cjs)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

should_check_file() {
  case "$1" in
    *.ts | *.tsx) ;;
    *)
      return 1
      ;;
  esac

  is_known_exempt "$1" && return 1
  is_test_file "$1" && return 1
  is_script_file "$1" && return 1
  is_root_config_file "$1" && return 1

  return 0
}

for file_path in "$@"; do
  repo_relative_path=$(to_repo_relative "$file_path")

  if [ -f "$file_path" ]; then
    actual_path="$file_path"
  elif [ -f "$repo_relative_path" ]; then
    actual_path="$repo_relative_path"
  else
    continue
  fi

  should_check_file "$repo_relative_path" || continue

  line_count=$(wc -l < "$actual_path")
  line_count=$(printf '%s' "$line_count" | tr -d '[:space:]')

  if [ "$line_count" -gt "$MAX_LINES" ]; then
    printf '⚠ %s exceeds %s lines (%s). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.\n' "$repo_relative_path" "$MAX_LINES" "$line_count" >&2
  fi
done

exit 0
