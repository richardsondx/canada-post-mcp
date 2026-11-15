# EVIDENCE

- Date: 2026-11-11
- Run: stage2-canada-post-mcp-2026-11-11-01, units U1-U4
- Machine: node v24.22.1, npm 10.9.4

## Commands and results

### Install and build

- Command: `npm install --no-audit --no-fund` then `npm run build`
- Result: added 101 packages in 3m. Build produced `dist/` with common, mymail, offices, rates, server, track (plus source maps).

### Tests

- Command: `npm test`
- Result: 20 tests, 20 pass, 0 fail.
- Coverage: tool schemas and 4-tool list over stdio, tracking-number validation (16/13/20 digits, S10 ending in CA, 15-digit DNC), postal code validation, recorded directory addresses, MyMail mock path, MyMail not-configured path, live smoke test.
- Live smoke test: passed as an honest skip. It printed `SMOKE SKIP: Canada Post blocked the live track call; reason recorded in result.`

### Doctor

- Command: `./check.sh doctor` and `./check.sh doctor --json`
- Result: `doctor: node=v24.22.1 npm=10.9.4 deps=ok build=ok tools=ok credential_scan=ok`, `doctor: PASS`, exit 0.
- JSON: `{"command":"doctor","pass":true,"node":"v24.22.1","npm":"10.9.4","dependencies":"ok","build":"ok","tools":"ok","credential_scan":"ok","failures":0}`

### Drive

- Command: `./check.sh drive`
- Result: `drive: done. Results in repo/evidence/drive-latest.json`
- Tools listed: find_post_office, get_rates, list_mymail, track_parcel.
- track_parcel for `01189998819991197253`: status `unavailable`, http_status 0 from node fetch (no HTTP response; the request itself failed). Curl from the same machine earlier returned HTTP 403 for the same public JSON endpoint. No status was invented.
- get_rates for M5G 1N6 to V6B 1A1, 1 kg, 30 x 20 x 10 cm: source `public-find-a-rate-page`, no rates returned. No API credentials were configured, and the public calculator has no public JSON endpoint. No rate was invented.
- find_post_office for Toronto, radius 5 km: source `recorded-directory`, 8 offices. First result: 100 King St W CN0119, Toronto, ON.
- list_mymail: mode `not-configured`, configured false. No login.

### Evidence

- Command: `./check.sh evidence --json`
- Result: clean JSON. Files in `repo/evidence/`: `drive-latest.json` and timestamped `drive-*.json`.

### Credential scan

- Command: `grep -rInE -i '(password|api[_-]?key|secret|token)...' src test *.md *.json *.example`
- Result: no hits. Doctor credential scan also ok.
- No password, token, or API key is in the repo, git history, logs, or this report.

## Live observations (real numbers, routes, places)

- Tracking number used: `01189998819991197253`. Source: Shopify public Liquid docs, https://shopify.dev/docs/api/liquid/objects/fulfillment.md
- Live status observed for that number: none. Canada Post blocked the lookup. Curl got HTTP 403 from the public tracking JSON endpoint. Node fetch in the server got no HTTP response during drive. The tool reports `unavailable` with the source URL and the reason.
- Second public number: `LM217656065CA`, reported delivered March 16 in a search snippet. Same 403 block applied. Not verified live.
- Rates route used: Toronto M5G 1N6 to Vancouver V6B 1A1, 1 kg, 30 x 20 x 10 cm. Live rates observed: none. No credentials were configured. The public Find a Rate page loads (HTTP 200) but has no public JSON endpoint.
- Place used: downtown Toronto, Ontario. 8 real post offices with real addresses, verified 2026-11-11 from canadapost.ca listings. See `research.md`.
- Find a post office page: https://www.canadapost-postescanada.ca/cpc/en/tools/find-a-post-office.page returned HTTP 200. The `/cpc/en/personal/receiving/find-a-post-office.page` variant returned HTTP 404.

## Fixes made during the build

- Tracking validator: first version rejected S10 codes ending in a country other than CA, and rejected the 20-digit Shopify example number. Fixed to accept 13/15/16/20 digits and S10 ending in CA only.
- `fetchText`: first version threw on network failure, which broke `./check.sh drive` with `fetch failed`. Fixed to return status 0 and a reason string. Drive passes after the fix.
- `./check.sh evidence --json`: first version mixed a summary line with the JSON. Fixed to emit clean JSON when `--json` is passed.
