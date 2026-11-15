# 🍁 UNOFFICIAL Canada Post MCP Server

> **UNOFFICIAL. This project is not affiliated with, endorsed by, or connected to Canada Post Corporation / Postes Canada.**
> Canada Post publishes no official MCP server. This is a community project built by Canadians, for Canadians, in red and white.

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI agents four Canada Post tools: parcel tracking, shipping rates, post office finder, and MyMail (local only, opt-in).

## Tools

| Tool | What it does |
| --- | --- |
| `track_parcel` | Track a parcel by tracking number. Live status from Canada Post public tracking, or an honest error when Canada Post blocks the request. |
| `get_rates` | Get shipping rates for a route. Live rates need free Developer Program credentials; without them it links the public Find a Rate calculator and never invents a rate. |
| `find_post_office` | Find post offices near a place or postal code. Every result has a real address. |
| `list_mymail` | List incoming mail from MyMail. Local only, opt-in, mock mode for tests. Never logs in. |

## Install

```bash
npm install
npm run build
npm start
```

That is the one start command. The server runs on stdio. Add it to your MCP client:

```json
{
  "mcpServers": {
    "canada-post": {
      "command": "node",
      "args": ["/path/to/canada-post-mcp/dist/server.js"]
    }
  }
}
```

## Config

Copy `.env.example` to `.env`. No values are real. Leave blank to use public routes only.

```bash
cp .env.example .env
```

| Variable | Use |
| --- | --- |
| `CANADA_POST_DEVPORTAL_KEY` | Developer Portal API Key for your app. Preferred route, used first. |
| `CANADA_POST_DEVPORTAL_SECRET` | Developer Portal API Secret for your app. Never commit this. |
| `CANADA_POST_CUSTOMER_NUMBER` | Your Canada Post customer number. Needed for commercial rates. |
| `CANADA_POST_CONTRACT_NUMBER` | Your Canada Post contract number, if you have one. Needed for some rates. |
| `CANADA_POST_API_KEY` | Legacy Developer Program key. Authenticated fallback for Track, Rating, and Post Office APIs. |
| `CANADA_POST_API_PASSWORD` | Legacy Developer Program password for the key above. |
| `CANADA_POST_MyMAIL_ENABLED` | Set `true` only on your own machine to enable MyMail. Default off. |
| `CANADA_POST_MyMAIL_MOCK` | Set `true` with the above for mock sample data. No login. |
| `CANADA_POST_MyMAIL_EXPORT_FILE` | Path to a MyMail JSON file you saved yourself from the Canada Post app. |

Get free Developer Program credentials at the [Canada Post Developer Program](https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/gettingstarted.jsf). For the preferred route, create an app in the [Canada Post Developer Portal](https://developer-developpeur.canadapost-postescanada.ca/devportal-portaildesdeveloppeurs/), subscribe it to Tracking and Rating, and copy its API Key and API Secret into `.env`. The server gets a token with OAuth2 client credentials, scope `merchant`, then calls Tracking v1 and Rating v1. A Test app returns stubbed data, not live parcel data. A production app returns live data.

## Examples

Track a parcel (16-digit domestic number, or a 13-character code ending in CA):

```json
{ "tracking_number": "1234567890123456" }
```

Get rates from Toronto to Vancouver for a 1 kg parcel:

```json
{
  "origin_postal_code": "M5G 1N6",
  "destination_postal_code": "V6B 1A1",
  "weight_kg": 1,
  "length_cm": 30,
  "width_cm": 20,
  "height_cm": 10
}
```

Find post offices near downtown Toronto:

```json
{ "query": "Toronto", "radius_km": 5 }
```

List MyMail (mock mode):

```json
{ "limit": 5 }
```

## MyMail: local only, opt-in, break risk

MyMail shows incoming Lettermail, Personalized Mail, and Neighbourhood Mail in the Canada Post app. This server treats MyMail as local only:

- MyMail is off by default. It needs explicit env config to run at all.
- With no config, `list_mymail` fails cleanly with a clear message.
- Mock mode returns labelled sample items. No live login happens in tests or in this repo.
- This server never stores a password or token, never logs in to a Canada Post account, and never scrapes with a hardcoded account.
- **Break risk:** MyMail has no public API. If Canada Post changes its app or site, the MyMail path can break without warning. Live MyMail proof is a user run on their own machine after publish, not part of this repo.

## Honest data policy

- A tool returns a real status, rate, or address only when Canada Post actually returned it.
- When Canada Post blocks a public request (the public tracking JSON endpoint returned HTTP 403 from this build machine on 2026-11-11), the tool says so, names the source URL, and invents nothing.
- The post office finder without API credentials uses a small recorded directory of real downtown Toronto offices, verified 2026-11-11 from canadapost.ca listings, and labels it as recorded data.
- See `research.md` for every route, source link, live observation, and block.

## Check CLI

```bash
./check.sh --help
./check.sh doctor    # node, deps, build, credential scan
./check.sh launch    # start the server
./check.sh drive     # list tools, run one track / rates / finder call
./check.sh evidence  # write results to evidence/
./check.sh cleanup   # stop only what the run started
```

## Tests

```bash
npm test
```

Tests cover tool schemas, tracking-number validation, postal code validation, and the MyMail mock path with no live login. The live smoke test is skipped cleanly when Canada Post blocks it, and the skip is recorded in `EVIDENCE.md`.

## Official Canada Post links

- Track a package: https://www.canadapost-postescanada.ca/track-reperage/en#/home
- Find a Rate: https://www.canadapost-postescanada.ca/cpc/en/tools/find-a-rate.page
- Find a post office: https://www.canadapost-postescanada.ca/cpc/en/personal/receiving/find-a-post-office.page
- MyMail: https://www.canadapost-postescanada.ca/cpc/en/personal/mymail.page
- Developer Program: https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/gettingstarted.jsf

## Disclaimer

This project is UNOFFICIAL. It is not affiliated with, endorsed by, sponsored by, or connected to Canada Post Corporation / Postes Canada. "Canada Post", "Postes Canada", "MyMail", "Xpresspost", and "Lettermail" are trademarks of Canada Post Corporation. This server uses public web routes and the official Developer Program APIs with the user's own credentials. Use it at your own risk, and confirm rates, delivery dates, and post office hours on the official Canada Post site before you act on them.

## License

MIT. See `LICENSE`.
