#!/bin/bash
#
# Ralph Wiggum Loop Script for Naltrexone University
# See docs/_ralphwiggum/protocol.md for full documentation
#
# Usage:
#   ./scripts/ralph-loop.sh start   # Start the loop in tmux
#   ./scripts/ralph-loop.sh stop    # Stop the loop
#   ./scripts/ralph-loop.sh status  # Check status
#
# Environment variables:
#   RALPH_AGENT          - Agent to use: "claude" (default), "codex", "opencode"
#   RALPH_TMUX_SESSION   - tmux session name (default: naltrexone-ralph)
#   RALPH_MAX_ITERATIONS - Max iterations (default: 50)
#   RALPH_SLEEP_SECONDS  - Sleep between iterations (default: 2)

set -e

# Configuration
RALPH_AGENT="${RALPH_AGENT:-claude}"
RALPH_TMUX_SESSION="${RALPH_TMUX_SESSION:-naltrexone-ralph}"
RALPH_MAX_ITERATIONS="${RALPH_MAX_ITERATIONS:-50}"
RALPH_SLEEP_SECONDS="${RALPH_SLEEP_SECONDS:-2}"

# Project root (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Agent command mapping
get_agent_command() {
  case "$RALPH_AGENT" in
    claude)
      echo "claude --dangerously-skip-permissions -p"
      ;;
    codex)
      echo "codex --dangerously-auto-approve -p"
      ;;
    opencode)
      echo "opencode --auto-approve -p"
      ;;
    *)
      echo "Unknown agent: $RALPH_AGENT" >&2
      exit 1
      ;;
  esac
}

# The actual loop command
get_loop_command() {
  local agent_cmd
  agent_cmd=$(get_agent_command)

  cat <<EOF
cd "$PROJECT_ROOT"
MAX=$RALPH_MAX_ITERATIONS
for i in \$(seq 1 \$MAX); do
  echo "=== Iteration \$i/\$MAX ==="
  $agent_cmd "\$(cat PROMPT.md)"
  if ! grep -q "^- \[ \]" PROGRESS.md 2>/dev/null; then
    echo "All tasks complete!"
    break
  fi
  sleep $RALPH_SLEEP_SECONDS
done
echo "Loop finished."
EOF
}

start_loop() {
  # Check prerequisites
  if [[ ! -f "$PROJECT_ROOT/PROMPT.md" ]]; then
    echo "Error: PROMPT.md not found in $PROJECT_ROOT"
    echo "Create it first. See docs/_ralphwiggum/protocol.md"
    exit 1
  fi

  if [[ ! -f "$PROJECT_ROOT/PROGRESS.md" ]]; then
    echo "Error: PROGRESS.md not found in $PROJECT_ROOT"
    echo "Create it first. See docs/_ralphwiggum/protocol.md"
    exit 1
  fi

  # Check if session exists
  if tmux has-session -t "$RALPH_TMUX_SESSION" 2>/dev/null; then
    echo "Session '$RALPH_TMUX_SESSION' already exists."
    echo "Attaching... (Ctrl+B, D to detach)"
    tmux attach -t "$RALPH_TMUX_SESSION"
  else
    echo "Creating new tmux session: $RALPH_TMUX_SESSION"
    echo "Agent: $RALPH_AGENT"
    echo "Max iterations: $RALPH_MAX_ITERATIONS"
    echo ""
    echo "Starting loop... (Ctrl+B, D to detach, Ctrl+C to stop)"

    # Create session and run loop
    tmux new-session -d -s "$RALPH_TMUX_SESSION" "$(get_loop_command); exec bash"
    tmux attach -t "$RALPH_TMUX_SESSION"
  fi
}

stop_loop() {
  if tmux has-session -t "$RALPH_TMUX_SESSION" 2>/dev/null; then
    echo "Stopping session '$RALPH_TMUX_SESSION'..."
    tmux kill-session -t "$RALPH_TMUX_SESSION"
    echo "Done."
  else
    echo "No session '$RALPH_TMUX_SESSION' found."
  fi
}

show_status() {
  echo "=== Ralph Wiggum Status ==="
  echo ""

  # tmux session status
  if tmux has-session -t "$RALPH_TMUX_SESSION" 2>/dev/null; then
    echo "tmux session: RUNNING ($RALPH_TMUX_SESSION)"
  else
    echo "tmux session: NOT RUNNING"
  fi
  echo ""

  # PROGRESS.md status
  if [[ -f "$PROJECT_ROOT/PROGRESS.md" ]]; then
    local total
    local done
    local pending
    total=$(grep -c "^\- \[" "$PROJECT_ROOT/PROGRESS.md" 2>/dev/null || echo "0")
    done=$(grep -c "^\- \[x\]" "$PROJECT_ROOT/PROGRESS.md" 2>/dev/null || echo "0")
    pending=$(grep -c "^\- \[ \]" "$PROJECT_ROOT/PROGRESS.md" 2>/dev/null || echo "0")
    echo "PROGRESS.md: $done/$total complete ($pending pending)"
  else
    echo "PROGRESS.md: NOT FOUND"
  fi
  echo ""

  # Recent commits
  echo "Recent commits:"
  cd "$PROJECT_ROOT"
  git log --oneline -5 2>/dev/null || echo "  (no commits)"
}

# Main
case "${1:-}" in
  start)
    start_loop
    ;;
  stop)
    stop_loop
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    echo ""
    echo "Commands:"
    echo "  start   - Start the Ralph loop in tmux"
    echo "  stop    - Stop the Ralph loop"
    echo "  status  - Show current status"
    echo ""
    echo "Environment variables:"
    echo "  RALPH_AGENT          - Agent: claude (default), codex, opencode"
    echo "  RALPH_TMUX_SESSION   - tmux session name (default: naltrexone-ralph)"
    echo "  RALPH_MAX_ITERATIONS - Max iterations (default: 50)"
    echo "  RALPH_SLEEP_SECONDS  - Sleep between iterations (default: 2)"
    exit 1
    ;;
esac
