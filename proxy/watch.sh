#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
BINARY_NAME="susemanagerproxy"
DEBOUNCE_SECONDS=5
POLL_INTERVAL=1

if [[ ! -d "$SRC_DIR" ]]; then
  echo "[watcher] source directory not found: $SRC_DIR" >&2
  exit 1
fi

# GNU stat (Linux) uses -c; BSD stat (macOS) uses -f.
if stat -c '%Y' "$SCRIPT_DIR" >/dev/null 2>&1; then
  STAT_ARGS=(-c '%Y %n')
else
  STAT_ARGS=(-f '%m %N')
fi

ARGS=("$@")
PROC_PID=""

ts() { date +"%H:%M:%S"; }
log() { printf '[%s] [watcher] %s\n' "$(ts)" "$*"; }

snapshot() {
  find "$SRC_DIR" \
    -type f \
    \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) \
    -not -path '*/.*' \
    -exec stat "${STAT_ARGS[@]}" {} + 2>/dev/null | sort
}

# Emit just the changed paths (added/removed/modified) between two snapshots.
diff_snapshot() {
  local old="$1" new="$2"
  diff <(printf '%s\n' "$old") <(printf '%s\n' "$new") \
    | sed -n 's/^[<>] //p' \
    | awk '{ $1=""; sub(/^ /,""); print }' \
    | sort -u
}

stop_proc() {
  if [[ -n "$PROC_PID" ]] && kill -0 "$PROC_PID" 2>/dev/null; then
    log "stopping pid $PROC_PID"
    kill "$PROC_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$PROC_PID" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$PROC_PID" 2>/dev/null; then
      log "force killing pid $PROC_PID"
      kill -9 "$PROC_PID" 2>/dev/null || true
    fi
    wait "$PROC_PID" 2>/dev/null || true
  fi
  PROC_PID=""
}

cleanup() {
  trap - INT TERM EXIT
  stop_proc
  exit 0
}
trap cleanup INT TERM EXIT

build_and_run() {
  log "building $BINARY_NAME..."
  if ! (cd "$SRC_DIR" && go build -o "$BINARY_NAME" .); then
    log "build FAILED — waiting for next change"
    return 1
  fi
  log "build OK, starting: ./$BINARY_NAME ${ARGS[*]:-}"
  (cd "$SRC_DIR" && exec ./"$BINARY_NAME" "${ARGS[@]}") &
  PROC_PID=$!
  log "started pid $PROC_PID"
}

print_changes() {
  local prefix="$1" old="$2" new="$3"
  diff_snapshot "$old" "$new" | while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    rel="${f#$SCRIPT_DIR/}"
    printf '          %s %s\n' "$prefix" "$rel"
  done
}

LAST_SNAPSHOT="$(snapshot)"
build_and_run || true

log "polling $SRC_DIR every ${POLL_INTERVAL}s (debounce ${DEBOUNCE_SECONDS}s)"

while true; do
  sleep "$POLL_INTERVAL"
  CUR_SNAPSHOT="$(snapshot)"
  [[ "$CUR_SNAPSHOT" == "$LAST_SNAPSHOT" ]] && continue

  log "changes detected:"
  print_changes "-" "$LAST_SNAPSHOT" "$CUR_SNAPSHOT"

  # debounce: keep absorbing changes until DEBOUNCE_SECONDS of quiet
  prev="$CUR_SNAPSHOT"
  quiet_for=0
  while (( quiet_for < DEBOUNCE_SECONDS )); do
    sleep "$POLL_INTERVAL"
    CUR_SNAPSHOT="$(snapshot)"
    if [[ "$CUR_SNAPSHOT" == "$prev" ]]; then
      quiet_for=$(( quiet_for + POLL_INTERVAL ))
    else
      print_changes "+" "$prev" "$CUR_SNAPSHOT"
      prev="$CUR_SNAPSHOT"
      quiet_for=0
    fi
  done

  LAST_SNAPSHOT="$CUR_SNAPSHOT"
  log "${DEBOUNCE_SECONDS}s quiet — rebuilding"
  stop_proc
  build_and_run || true
done
