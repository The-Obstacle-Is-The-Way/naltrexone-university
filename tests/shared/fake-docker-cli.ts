import { spawnSync } from 'node:child_process';

// Stand-ins for the runner's docker CLI and sleep. Each call is logged with
// its arguments kept apart, so a test sees exactly what docker would. Docker
// refuses pulls from the registries in FAKE_DOCKER_REFUSE the way Docker Hub
// did on 2026-10-09, hangs on those in FAKE_DOCKER_HANG, fails `run` when
// FAKE_DOCKER_RUN_FAILS is set, and reports health statuses in the order
// FAKE_DOCKER_HEALTH lists them, repeating the last. Sleep returns at once.
const LOG_CALL = `printf '%s\\037' "$(basename "$0")" "$@" >> "$FAKE_LOG"; printf '\\n' >> "$FAKE_LOG"`;
export const FAKE_DOCKER = `#!/bin/sh
${LOG_CALL}
eval "last=\\\${$#}"
case "$1" in
  pull)
    for hung in $FAKE_DOCKER_HANG; do
      case "$last" in "$hung"/*) exec /bin/sleep 30 ;; esac
    done
    for refused in $FAKE_DOCKER_REFUSE; do
      case "$last" in
        "$refused"/*)
          echo 'toomanyrequests: You have reached your unauthenticated pull rate limit.' >&2
          exit 1
          ;;
      esac
    done
    ;;
  run)
    if [ -n "$FAKE_DOCKER_RUN_FAILS" ]; then
      echo 'Bind for 0.0.0.0:5432 failed: port is already allocated' >&2
      exit 125
    fi
    echo 'fake-container-id'
    ;;
  inspect)
    count=$(( $(cat "$FAKE_DOCKER_HEALTH_COUNT" 2>/dev/null || echo 0) + 1 ))
    echo "$count" > "$FAKE_DOCKER_HEALTH_COUNT"
    echo "$FAKE_DOCKER_HEALTH" | awk -v n="$count" '{ print (n <= NF) ? $n : $NF }'
    ;;
  logs) echo 'FATAL:  fake postgres failed to start' ;;
esac
`;
export const FAKE_SLEEP = `#!/bin/sh
${LOG_CALL}
`;
// Stock macOS has no `timeout` (GNU coreutils), which the script bounds each
// pull with. On such a host the harness supplies a stand-in for the one form
// the script uses: it ends the command with TERM after the limit and exits
// 124, as GNU timeout does. CI's runner and hosts with coreutils use the
// real command.
export const HOST_HAS_TIMEOUT =
  spawnSync('sh', ['-c', 'command -v timeout'], { stdio: 'ignore' }).status ===
  0;
export const FAKE_TIMEOUT = `#!/bin/sh
case "$1" in --kill-after=*) shift ;; esac
limit=\${1%s}
shift
"$@" &
pid=$!
( /bin/sleep "$limit"; kill -TERM "$pid" 2>/dev/null ) &
watcher=$!
wait "$pid"
status=$?
kill "$watcher" 2>/dev/null
if [ "$status" -gt 128 ]; then exit 124; fi
exit "$status"
`;
