# Enforce Node version per .nvmrc - defends against stale global
# ~/.config/husky/init.sh that loads nvm but never calls `nvm use`.
# Without this, GUI-triggered hooks or shells that do not pick up
# .nvmrc automatically can run pnpm under the wrong Node.

hook_name="${hook_name:-hook}"

if [ -f .nvmrc ]; then
  raw_required="$(tr -d 'v[:space:]' < .nvmrc)"
  required_major="$(printf '%s' "$raw_required" | cut -d. -f1)"

  case "$required_major" in
    '' | *[!0-9]*)
      echo "ERROR: ${hook_name} cannot parse .nvmrc" >&2
      echo "  Expected a plain Node major or semver value such as '24' or '24.16.0'." >&2
      echo "  Actual .nvmrc: ${raw_required:-<empty>}" >&2
      exit 1
      ;;
  esac

  actual_major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
  if [ -z "$actual_major" ] || [ "$actual_major" != "$required_major" ]; then
    echo "ERROR: ${hook_name} hook running on the wrong Node version" >&2
    echo "  .nvmrc requires: Node ${required_major}.x" >&2
    if [ -n "$actual_major" ]; then
      echo "  Currently active: v${actual_major}.x" >&2
    else
      echo "  Currently active: <node not on PATH>" >&2
    fi
    echo "" >&2
    echo "Fix one of:" >&2
    echo "  - In your terminal: 'nvm use' (or 'fnm use', 'asdf shell nodejs', etc.) before 'git ${hook_name#pre-}'." >&2
    echo "  - One-time: add '[ -f \"\$PWD/.nvmrc\" ] && nvm use --silent 2>/dev/null'" >&2
    echo "    after the nvm load in ~/.config/husky/init.sh so all repos auto-respect .nvmrc." >&2
    exit 1
  fi
fi
