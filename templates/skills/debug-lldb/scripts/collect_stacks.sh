#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
collect_stacks.sh --pid <pid> [--out <prefix>] [--repeat <n>] [--sleep <seconds>]
collect_stacks.sh --name <process-substring> [--out <prefix>] [--repeat <n>] [--sleep <seconds>]

Examples:
  collect_stacks.sh --pid 12345 --out /tmp/hang --repeat 3 --sleep 0.5
  collect_stacks.sh --name "my-app" --out /tmp/hang
USAGE
}

pid=""
name=""
out="stack"
repeat=1
sleep_s=0.5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pid)
      pid="$2"; shift 2;;
    --name)
      name="$2"; shift 2;;
    --out)
      out="$2"; shift 2;;
    --repeat)
      repeat="$2"; shift 2;;
    --sleep)
      sleep_s="$2"; shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2
      usage; exit 1;;
  esac

done

if [[ -z "$pid" ]]; then
  if [[ -n "$name" ]]; then
    if command -v pgrep >/dev/null 2>&1; then
      pid="$(pgrep -n -f "$name" || true)"
    fi
  fi
fi

if [[ -z "$pid" ]]; then
  echo "Missing --pid (or --name did not match any process)." >&2
  usage
  exit 1
fi

if command -v lldb >/dev/null 2>&1; then
  debugger="lldb"
  run_debugger() {
    lldb -p "$pid" -o 'thread backtrace all' -o 'detach' -o 'quit'
  }
elif command -v gdb >/dev/null 2>&1; then
  debugger="gdb"
  run_debugger() {
    gdb -q -p "$pid" -ex "thread apply all bt" -ex "detach" -ex "quit"
  }
else
  echo "No lldb or gdb found in PATH." >&2
  exit 2
fi

stamp="$(date +%Y%m%d_%H%M%S)"
for i in $(seq 1 "$repeat"); do
  file="${out}_${pid}_${stamp}_${i}.txt"
  echo "[$debugger] pid=$pid -> $file"
  run_debugger > "$file" 2>&1 || true
  if [[ "$i" -lt "$repeat" ]]; then
    sleep "$sleep_s"
  fi

done
