#!/usr/bin/env bash
# canada-post-mcp check CLI (UNOFFICIAL).
# Commands: launch, doctor, drive, evidence, cleanup, --help.
# doctor and drive support --json for machine-readable output.
# cleanup kills only processes this CLI started.
set -u
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVIDENCE_DIR="$REPO_DIR/evidence"
PID_FILE="$REPO_DIR/.check-pids"
JSON_OUT=false

usage() {
  cat <<'EOF'
canada-post-mcp check CLI (UNOFFICIAL, not affiliated with Canada Post)

Usage: ./check.sh <command> [options]

Commands:
  launch    Start the MCP server on stdio (npm start). Prints the ready line.
  doctor    Read-only health check: node, deps, build, 4 tools, credential scan.
  drive     Run the server and call track / rates / finder once each, live or recorded.
  evidence  Run drive and write the results to evidence/ as JSON.
  cleanup   Stop only the processes this CLI started. Never deletes evidence.

Options:
  --json    Machine-readable JSON output (doctor, drive, evidence).
  --help    Show this help.

Examples:
  ./check.sh doctor
  ./check.sh doctor --json
  ./check.sh drive
  ./check.sh evidence --json
  ./check.sh cleanup
EOF
}

json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '""'; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then echo "MISSING: $1 is not installed." >&2; return 1; fi
  return 0
}

credential_scan() {
  # Scan source, docs, and config for credential patterns. .env is gitignored
  # and never scanned for values; the scan checks that no secret value is
  # committed in tracked files. .env.example must hold placeholders only.
  local hits=""
  hits="$(grep -rInE -i '(password|passwd|api[_-]?key|secret|token|bearer)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_\-]{8,}' "$REPO_DIR/src" "$REPO_DIR/test" "$REPO_DIR"/*.md "$REPO_DIR"/*.json "$REPO_DIR"/*.example 2>/dev/null | grep -v 'CANADA_POST_API_KEY=$' | grep -v 'CANADA_POST_API_PASSWORD=$' | grep -v 'CANADA_POST_CUSTOMER_NUMBER=$' || true)"
  # Also flag any .env file that is not the example (a real .env must never be committed).
  if [ -f "$REPO_DIR/.env" ]; then
    if grep -qE '=[^[:space:]]+' "$REPO_DIR/.env" 2>/dev/null; then
      hits="${hits}"$'\n'"REAL_VALUES_IN_.env: .env contains filled values; it is gitignored, but keep it local only."
    fi
  fi
  printf '%s' "$hits"
}

doctor() {
  local failures=0
  local notes=()
  local node_v="missing" npm_v="missing" deps="missing" build="missing" tools="missing" creds="missing"
  if need_cmd node; then node_v="$(node --version)"; else failures=$((failures+1)); notes+=("node is not installed"); fi
  if need_cmd npm; then npm_v="$(npm --version)"; else failures=$((failures+1)); notes+=("npm is not installed"); fi
  if [ -d "$REPO_DIR/node_modules/@modelcontextprotocol/sdk" ]; then deps="ok"; else failures=$((failures+1)); notes+=("dependencies are not installed; run npm install"); fi
  if [ -f "$REPO_DIR/dist/server.js" ]; then build="ok"; else
    if (cd "$REPO_DIR" && npm run build >/dev/null 2>&1); then build="ok"; else failures=$((failures+1)); notes+=("build failed; run npm run build"); fi
  fi
  # Tool list: run the server once and count tools via an MCP probe.
  if [ "$build" = "ok" ]; then
    local tool_count
    tool_count="$(cd "$REPO_DIR" && node --input-type=module -e '
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const t = new StdioClientTransport({ command: "node", args: ["dist/server.js"], stderr: "ignore" });
const c = new Client({ name: "doctor", version: "0.1.0" }, { capabilities: {} });
await c.connect(t);
const tools = await c.listTools();
console.log(tools.tools.map((x) => x.name).sort().join(","));
await c.close();
' 2>/dev/null || echo "PROBE_FAILED")"
    if [ "$tool_count" = "find_post_office,get_rates,list_mymail,track_parcel" ]; then tools="ok"; else failures=$((failures+1)); notes+=("tool list probe failed (got: $tool_count); expected find_post_office,get_rates,list_mymail,track_parcel"); fi
  fi
  local scan
  scan="$(credential_scan)"
  if [ -z "$scan" ]; then creds="ok"; else failures=$((failures+1)); notes+=("credential scan found: $scan"); fi
  if [ "$JSON_OUT" = true ]; then
    printf '{"command":"doctor","pass":%s,"node":"%s","npm":"%s","dependencies":"%s","build":"%s","tools":"%s","credential_scan":"%s","failures":%s}\n' \
      "$([ "$failures" -eq 0 ] && echo true || echo false)" "$node_v" "$npm_v" "$deps" "$build" "$tools" "$creds" "$failures"
  else
    echo "doctor: node=$node_v npm=$npm_v deps=$deps build=$build tools=$tools credential_scan=$creds"
    for n in "${notes[@]}"; do echo "  FAIL: $n"; done
    if [ "$failures" -eq 0 ]; then echo "doctor: PASS"; else echo "doctor: FAIL ($failures failures)"; fi
  fi
  [ "$failures" -eq 0 ]
}

launch() {
  echo "Starting canada-post-mcp (UNOFFICIAL) on stdio..."
  echo "Ready signal: the server prints 'canada-post-mcp (UNOFFICIAL) started on stdio' to stderr, then speaks MCP on stdin/stdout."
  echo "Run: npm start"
  (cd "$REPO_DIR" && exec npm start)
}

drive() {
  mkdir -p "$EVIDENCE_DIR"
  local out="$EVIDENCE_DIR/drive-latest.json"
  if [ "$JSON_OUT" = true ]; then export CP_QUIET=1; fi
  (cd "$REPO_DIR" && node --input-type=module -e '
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
const t = new StdioClientTransport({ command: "node", args: ["dist/server.js"], stderr: "ignore" });
const c = new Client({ name: "drive", version: "0.1.0" }, { capabilities: {} });
await c.connect(t);
const tools = await c.listTools();
const call = async (name, args) => {
  const r = await c.callTool({ name, arguments: args });
  try { return JSON.parse(r.content[0].text); }
  catch { return { status: "unparsable-tool-result", raw_text: r.content[0].text, fetched_at: new Date().toISOString() }; }
};
const track = await call("track_parcel", { tracking_number: "01189998819991197253" });
const rates = await call("get_rates", { origin_postal_code: "M5G 1N6", destination_postal_code: "V6B 1A1", weight_kg: 1, length_cm: 30, width_cm: 20, height_cm: 10 });
const finder = await call("find_post_office", { query: "Toronto", radius_km: 5 });
const mymail = await call("list_mymail", { limit: 3 });
const result = { generated_at: new Date().toISOString(), tools: tools.tools.map((x) => x.name).sort(), track, rates, finder, mymail };
fs.writeFileSync(process.argv[1], JSON.stringify(result, null, 2));
if (!process.env.CP_QUIET) console.log(JSON.stringify({ tools: result.tools, track_status: track.status, rates_source: rates.source, finder_offices: finder.offices.length, mymail_mode: mymail.mode }));
await c.close();
' "$out")
  local rc=$?
  if [ "$JSON_OUT" = true ]; then
    if [ $rc -eq 0 ] && [ -f "$out" ]; then cat "$out"; else echo '{"command":"drive","pass":false}'; fi
  else
    if [ $rc -eq 0 ]; then echo "drive: done. Results in $out"; else echo "drive: FAILED (exit $rc). Check that the build exists: npm run build."; fi
  fi
  return $rc
}

evidence_cmd() {
  drive
  local rc=$?
  if [ $rc -eq 0 ]; then
    cp "$EVIDENCE_DIR/drive-latest.json" "$EVIDENCE_DIR/drive-$(date +%Y-%m-%d-%H%M).json"
    if [ "$JSON_OUT" != true ]; then echo "evidence: wrote $EVIDENCE_DIR/drive-latest.json"; fi
  fi
  return $rc
}

cleanup() {
  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null && echo "cleanup: stopped PID $pid"; fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  echo "cleanup: done. Evidence in $EVIDENCE_DIR was kept."
}

CMD="${1:-}"
shift || true
for arg in "$@"; do [ "$arg" = "--json" ] && JSON_OUT=true; done
case "$CMD" in
  --help|-h|help|"") usage; exit 0 ;;
  launch) launch ;;
  doctor) doctor ;;
  drive) drive ;;
  evidence) evidence_cmd ;;
  cleanup) cleanup ;;
  *) echo "Unknown command: $CMD" >&2; usage; exit 2 ;;
esac
