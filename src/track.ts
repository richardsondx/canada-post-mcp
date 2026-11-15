// track_parcel: Canada Post parcel tracking.
// Route order:
// 1. Official Track API (needs free Developer Program key in env) - authenticated fallback.
// 2. Public web JSON endpoint used by the Canada Post Track page - no key.
// 3. Honest failure: no status is ever invented. The result names the block.
import {
  DEVPORTAL_BASE,
  env,
  fetchText,
  getDevPortalToken,
  hasDevPortalCredentials,
  hasOfficialApiCredentials,
  nowIso,
  publicTrackJsonUrl,
  trackPageUrl,
} from "./common.js";

export interface TrackResult {
  tracking_number: string;
  status: string;
  status_detail?: string;
  events?: Array<{ date?: string; description?: string; location?: string; raw?: unknown }>;
  source: string;
  source_url: string;
  fetched_at: string;
  http_status?: number;
  reason?: string;
  raw?: unknown;
}

function parseOfficialSummaryXml(xml: string): { status: string; detail?: string } {
  // Lightweight extraction; the official summary is XML, not JSON.
  const pick = (tag: string): string | undefined => {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
    return m ? m[1].trim() : undefined;
  };
  const status = pick("pin-summary") ?? pick("status") ?? pick("event-description");
  const delivered = /delivered/i.test(xml);
  return {
    status: delivered ? "delivered" : (status ?? "unknown"),
    detail: pick("event-description") ?? pick("expected-delivery-date"),
  };
}

async function trackViaDevPortal(pin: string): Promise<TrackResult> {
  const url = `${DEVPORTAL_BASE}/tracking/v1/pins/${encodeURIComponent(pin)}/summaries`;
  const token = await getDevPortalToken();
  if (!token) {
    return {
      tracking_number: pin,
      status: "unavailable",
      source: "devportal-tracking-api",
      source_url: url,
      fetched_at: nowIso(),
      http_status: 401,
      reason: "DevPortal token call failed. Check CANADA_POST_DEVPORTAL_KEY and CANADA_POST_DEVPORTAL_SECRET.",
    };
  }
  const res = await fetchText(url, {
    headers: { Accept: "application/json", "Accept-Language": "en-CA", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return {
      tracking_number: pin,
      status: "unavailable",
      source: "devportal-tracking-api",
      source_url: url,
      fetched_at: nowIso(),
      http_status: res.status,
      reason: `DevPortal Tracking API returned HTTP ${res.status}.`,
    };
  }
  let data: any;
  try {
    data = JSON.parse(res.text);
  } catch {
    return {
      tracking_number: pin,
      status: "unavailable",
      source: "devportal-tracking-api",
      source_url: url,
      fetched_at: nowIso(),
      http_status: res.status,
      reason: "DevPortal Tracking API returned a non-JSON response. No status was invented.",
    };
  }
  const item = Array.isArray(data) ? data[0] : data;
  return {
    tracking_number: pin,
    status: item?.eventDescription ?? item?.eventType ?? "unknown",
    status_detail: item?.serviceName ? `${item.serviceName}, expected ${item.expectedDeliveryDate ?? "unknown"}` : undefined,
    source: "devportal-tracking-api",
    source_url: url,
    fetched_at: nowIso(),
    http_status: res.status,
    raw: item,
  };
}

async function trackViaOfficialApi(pin: string): Promise<TrackResult> {
  const url = `https://soa-gw.canadapost.ca/vis/track/pin/${encodeURIComponent(pin)}/summary`;
  const creds = Buffer.from(
    `${env("CANADA_POST_API_KEY")}:${env("CANADA_POST_API_PASSWORD")}`,
  ).toString("base64");
  const res = await fetchText(url, {
    headers: { Accept: "application/vnd.cpc.track-v2+xml", Authorization: `Basic ${creds}` },
  });
  if (!res.ok) {
    return {
      tracking_number: pin,
      status: "unavailable",
      source: "official-track-api",
      source_url: url,
      fetched_at: nowIso(),
      http_status: res.status,
      reason: `Official Track API returned HTTP ${res.status}. Check CANADA_POST_API_KEY, CANADA_POST_API_PASSWORD, and CANADA_POST_CUSTOMER_NUMBER.`,
    };
  }
  const parsed = parseOfficialSummaryXml(res.text);
  return {
    tracking_number: pin,
    status: parsed.status,
    status_detail: parsed.detail,
    source: "official-track-api",
    source_url: url,
    fetched_at: nowIso(),
    http_status: res.status,
    raw: res.text.slice(0, 4000),
  };
}

async function trackViaPublicJson(pin: string): Promise<TrackResult> {
  const url = publicTrackJsonUrl(pin);
  const res = await fetchText(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://www.canadapost-postescanada.ca/track-reperage/en",
    },
  });
  if (!res.ok) {
    const httpNote = res.status > 0 ? `(HTTP ${res.status})` : "(no HTTP response; the request itself failed)";
    return {
      tracking_number: pin,
      status: "unavailable",
      source: "public-track-json",
      source_url: url,
      fetched_at: nowIso(),
      http_status: res.status,
      reason:
        `Canada Post blocked the public tracking request from this machine ${httpNote}. ` +
        `The public Track page may still work in a browser. No status was invented. ` +
        `Use official API credentials (CANADA_POST_API_KEY) for the authenticated route, or open ${trackPageUrl(pin)} in a browser.`,
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(res.text);
  } catch {
    return {
      tracking_number: pin,
      status: "unavailable",
      source: "public-track-json",
      source_url: url,
      fetched_at: nowIso(),
      http_status: res.status,
      reason: "Canada Post returned a non-JSON response for the public tracking endpoint. No status was invented.",
      raw: res.text.slice(0, 1000),
    };
  }
  return {
    tracking_number: pin,
    status: "see-data",
    status_detail: "Parsed live JSON from the Canada Post public tracking endpoint. See data.",
    source: "public-track-json",
    source_url: url,
    fetched_at: nowIso(),
    http_status: res.status,
    raw: data,
  };
}

export async function trackParcel(pin: string): Promise<TrackResult> {
  if (hasDevPortalCredentials()) {
    const viaPortal = await trackViaDevPortal(pin);
    if (viaPortal.status !== "unavailable") return viaPortal;
    const viaPublic = await trackViaPublicJson(pin);
    if (viaPublic.status !== "unavailable") return viaPublic;
    return {
      ...viaPublic,
      reason: `DevPortal API failed (${viaPortal.http_status}). Public route also failed (${viaPublic.http_status}). ${viaPublic.reason ?? ""}`,
    };
  }
  if (hasOfficialApiCredentials()) {
    const viaApi = await trackViaOfficialApi(pin);
    if (viaApi.status !== "unavailable") return viaApi;
    // Fall through to the public route and report both attempts in the reason.
    const viaPublic = await trackViaPublicJson(pin);
    if (viaPublic.status !== "unavailable") return viaPublic;
    return {
      ...viaPublic,
      reason: `Official API failed (${viaApi.http_status}). Public route also failed (${viaPublic.http_status}). ${viaPublic.reason ?? ""}`,
    };
  }
  return trackViaPublicJson(pin);
}
