# Research: Canada Post public routes

- Date: 2026-11-11
- Researcher: generator, stage2-canada-post-mcp-2026-11-11-01, unit U1
- Rule: one source link per route. Live observations only. Blocks recorded honestly.

## 1. Parcel tracking

- Public Track page: https://www.canadapost-postescanada.ca/track-reperage/en#/home
- Public page observed 2026-11-11: HTTP 200. The page is an Angular single-page app. It loads `runtime.js`, `polyfills.js`, `main.js`. No tracking data is in the HTML.
- Public JSON endpoint (unofficial, reported in the wild): `GET https://www.canadapost-postescanada.ca/track-reperage/rs/track/json/package?pins={pin}`
- Source for that endpoint: https://github.com/egg-/delivery-tracker/issues/23
- Live observation 2026-11-11: bare curl returned HTTP 403 with title "403 Please log in". With a cookie jar from the Track home page plus Referer, the `?pins=` form returned HTTP 406 / 404 error page, and the `/package/{pin}` form returned HTTP 403. A text fetch of the same URL also returned HTTP 403 access denied.
- Conclusion: the public JSON tracking endpoint is blocked from this build machine on 2026-11-11. The server tries it and reports the block honestly. It never invents a status.
- Real tracking number found in a public source: `01189998819991197253`, in Shopify's public Liquid docs for the fulfillment object.
- Source: https://shopify.dev/docs/api/liquid/objects/fulfillment.md
- Live status observed for that number: none. Canada Post blocked the lookup (HTTP 403), so no status was observed and none is claimed.
- Second public number: `LM217656065CA`, reported delivered March 16 in a search snippet. Source: Ecosia search result for that number. Not verified live in this run; the same 403 block applied.
- Format facts (Canada Post public guidance, via 4tracking.net): domestic parcels use 16 digits, example shape `1234 5678 9123 4567`. Prepaid envelopes use 13 characters, example `AA 123 456 789 CA`. Delivery Notice Card numbers have 15 digits.
- Source: https://www.4tracking.net/en/carriers/canada-post
- Official Track API (authenticated fallback): `GET https://soa-gw.canadapost.ca/vis/track/pin/{pin}/summary`, header `Accept: application/vnd.cpc.track-v2+xml`, HTTP Basic auth with Developer Program key and password. Development host: `ct.soa-gw.canadapost.ca`.
- Source: https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/rating/getrates/default.jsf (Rating docs) and https://github.com/spwig/components/blob/HEAD/integrations/shipping/canadapost/README.md (endpoint table)

## 2. Rates

- Public Find a Rate calculator: https://www.canadapost-postescanada.ca/cpc/en/tools/find-a-rate.page
- Live observation 2026-11-11: HTTP 200, HTML page loads. It is a browser app (`/find-a-rate/faronline.js`). No public JSON rate endpoint was found in the page markup.
- Route used for the tool: Toronto M5G 1N6 to Vancouver V6B 1A1, 1 kg, 30 x 20 x 10 cm.
- Live rates observed for that route: none. No API credentials were configured in this run, and the public calculator has no public JSON endpoint. No rate was invented. The tool links the calculator page.
- Official Rating API (authenticated fallback): `POST https://soa-gw.canadapost.ca/rs/ship/price`, headers `Accept: application/vnd.cpc.ship.rate-v4+xml` and `Content-Type: application/vnd.cpc.ship.rate-v4+xml`, HTTP Basic auth with Developer Program key and password. Body is a `mailing-scenario` XML document (rate-v4). Omit `customer-number` for counter rates; include it for commercial rates.
- Source: https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/rating/getrates/default.jsf
- Developer portal (new REST API): https://developer-developpeur.canadapost-postescanada.ca/devportal-portaildesdeveloppeurs/ship-parcels
- Developer Program getting started: https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/gettingstarted.jsf

## 3. Post office finder

- Public Find a post office page: https://www.canadapost-postescanada.ca/cpc/en/tools/find-a-post-office.page
- Live observation 2026-11-11: curl returned HTTP 200 for the `/cpc/en/tools/find-a-post-office.page` URL and HTTP 404 for the `/cpc/en/personal/receiving/find-a-post-office.page` variant. The locator is a browser app; no public JSON endpoint was found.
- Real place used: downtown Toronto, Ontario.
- Real post offices with real addresses, verified 2026-11-11 from Canada Post listings at canadapost.ca (search results):
  - 700 Bay St #003, Toronto, ON. Phone +1 613-734-8888. 43.658143, -79.385305.
  - 100 King St W CN0119, Toronto, ON. Phone +1 416-364-0540. 43.649507, -79.381793.
  - 279 Yonge St, Toronto, ON. Phone +1 416-506-0911. 43.655613, -79.380424.
  - 18 Lower Jarvis St, Toronto, ON. Phone +1 800-267-1177. 43.647638, -79.370919.
  - 220 Yonge St, Toronto, ON. 43.652783, -79.379557.
  - 200 Bay St, Toronto, ON. Phone +1 416-360-1512. 43.646568, -79.379533.
  - 31 Adelaide St E, Toronto, ON. Phone +1 866-607-6301. 43.650627, -79.377074.
  - 25 King St W, Toronto, ON. Phone +1 437-243-6609. 43.647843, -79.378149.
- These 8 addresses form the recorded directory fallback in `src/offices.ts`, labelled as recorded data.
- Official Find a Post Office API (authenticated fallback): `GET https://soa-gw.canadapost.ca/rs/postoffice?postalCode={code}&maximum={n}`, header `Accept: application/vnd.cpc.postoffice+xml`, HTTP Basic auth with Developer Program key and password. Development host: `ct.soa-gw.canadapost.ca`.
- Source: https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/findpostoffice/nearestpostoffice.jsf

## 4. MyMail

- MyMail page: https://www.canadapost-postescanada.ca/cpc/en/personal/mymail.page
- Source post: https://www.canadapost-postescanada.ca/information/app/drc/home?execution=e1s1
- Live observation 2026-11-11: MyMail is an app feature. Sign in happens in the Canada Post app with a Canada Post account. There is no public MyMail API and no public JSON endpoint.
- What MyMail covers: incoming Lettermail, Personalized Mail, and Neighbourhood Mail. Magazines, catalogues, and oversized mail are not included yet. Personal mail such as a postcard from a friend is not included.
- Source: https://www.canadapost-postescanada.ca/cpc/en/personal/mymail.page?icid=cta_int_jh_128
- Eligible addresses only, expanding across the country. Updates arrive 1 to 2 business days after subscribing.
- This run did no live Canada Post login. MyMail live proof is a user run after publish.
- Break risk: MyMail may break if Canada Post changes its app or site. The README warns about this.
