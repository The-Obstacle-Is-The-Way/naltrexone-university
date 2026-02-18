#!/usr/bin/env sh

MAX_LINES=350

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
    *.test.ts | *.test.tsx | *.spec.ts | *.spec.tsx | *.browser.spec.tsx)
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
  file_path="$1"

  [ -f "$file_path" ] || return 1

  case "$file_path" in
    *.ts | *.tsx) ;;
    *)
      return 1
      ;;
  esac

  is_known_exempt "$file_path" && return 1
  is_test_file "$file_path" && return 1
  is_script_file "$file_path" && return 1
  is_root_config_file "$file_path" && return 1

  return 0
}

for file_path in "$@"; do
  should_check_file "$file_path" || continue

  line_count=$(wc -l < "$file_path")
  line_count=$(printf '%s' "$line_count" | tr -d '[:space:]')

  if [ "$line_count" -gt "$MAX_LINES" ]; then
    printf '⚠ %s exceeds %s lines (%s). Consider splitting or add a // WHY: comment.\n' "$file_path" "$MAX_LINES" "$line_count" >&2
  fi
done

exit 0
