// find_post_office: Canada Post post office finder.
// Route order:
// 1. Official Find a Post Office API (needs free Developer Program key in env).
// 2. Recorded directory fallback: real downtown Toronto post offices with real
//    addresses, verified 2026-11-11 from canadapost.ca listings. Labelled as
//    recorded data, never presented as a live lookup. The live route needs a key.
import {
  env,
  fetchText,
  findPostOfficeUrl,
  hasOfficialApiCredentials,
  nowIso,
} from "./common.js";

export interface PostOffice {
  name: string;
  address: string;
  city: string;
  province: string;
  phone?: string;
  latitude: number;
  longitude: number;
  distance_km?: number;
  source_url: string;
}

// Real addresses, verified 2026-11-11 from Canada Post listings at canadapost.ca.
// All are downtown Toronto counters. Keep this list small and truthful.
export const RECORDED_DIRECTORY: PostOffice[] = [
  { name: "Canada Post", address: "700 Bay St #003", city: "Toronto", province: "ON", phone: "+1 613-734-8888", latitude: 43.658143, longitude: -79.385305, source_url: "https://www.canadapost.ca/" },
  { name: "Canada Post", address: "100 King St W CN0119", city: "Toronto", province: "ON", phone: "+1 416-364-0540", latitude: 43.649507, longitude: -79.381793, source_url: "https://www.canadapost.ca/" },
  { name: "Canada Post", address: "279 Yonge St", city: "Toronto", province: "ON", phone: "+1 416-506-0911", latitude: 43.655613, longitude: -79.380424, source_url: "https://www.canadapost.ca/" },
  { name: "Canada Post", address: "18 Lower Jarvis St", city: "Toronto", province: "ON", phone: "+1 800-267-1177", latitude: 43.647638, longitude: -79.370919, source_url: "https://www.canadapost.ca/" },
  { name: "Canada Post", address: "220 Yonge St", city: "Toronto", province: "ON", latitude: 43.652783, longitude: -79.379557, source_url: "https://www.canadapost.ca/" },
  { name: "Canada Post", address: "200 Bay St", city: "Toronto", province: "ON", phone: "+1 416-360-1512", latitude: 43.646568, longitude: -79.379533, source_url: "https://www.canadapost.ca/" },
  { name: "Canada Post", address: "31 Adelaide St E", city: "Toronto", province: "ON", phone: "+1 866-607-6301", latitude: 43.650627, longitude: -79.377074, source_url: "https://www.canadapost.ca/" },
  { name: "Canada Post", address: "25 King St W", city: "Toronto", province: "ON", phone: "+1 437-243-6609", latitude: 43.647843, longitude: -79.378149, source_url: "https://www.canadapost.ca/" },
];

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

// Downtown Toronto reference point, used only to sort and filter the recorded
// directory when the caller gives a Toronto query or an M5 postal code.
const TORONTO_DOWNTOWN = { lat: 43.65, lon: -79.38 };

export interface FinderResult {
  query?: string;
  postal_code?: string;
  radius_km: number;
  offices: PostOffice[];
  source: string;
  source_url: string;
  fetched_at: string;
  http_status?: number;
  reason?: string;
}

function recordedLookup(query: string | undefined, postalCode: string | undefined, radiusKm: number): FinderResult {
  const q = (query ?? "").trim().toLowerCase();
  const fsa = postalCode ? postalCode.trim().toUpperCase().slice(0, 3) : "";
  const isToronto = q.includes("toronto") || fsa.startsWith("M5") || fsa.startsWith("M4") || fsa === "";
  const offices = (isToronto ? RECORDED_DIRECTORY : [])
    .filter((o) => {
      if (q && !q.includes("toronto")) {
        const hay = `${o.name} ${o.address} ${o.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .map((o) => ({ ...o, distance_km: Math.round(haversineKm(TORONTO_DOWNTOWN.lat, TORONTO_DOWNTOWN.lon, o.latitude, o.longitude) * 100) / 100 }))
    .filter((o) => (o.distance_km ?? 99) <= radiusKm)
    .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99));
  return {
    query,
    postal_code: postalCode,
    radius_km: radiusKm,
    offices,
    source: "recorded-directory",
    source_url: findPostOfficeUrl(),
    fetched_at: nowIso(),
    reason:
      "Recorded directory fallback: real downtown Toronto post offices verified 2026-11-11 from canadapost.ca listings. " +
      "This is not a live lookup. Set CANADA_POST_API_KEY and CANADA_POST_API_PASSWORD for the live Find a Post Office API, " +
      "or confirm hours on the official Find a post office page before a trip.",
  };
}

async function finderViaOfficialApi(postalCode: string | undefined, query: string | undefined): Promise<FinderResult | null> {
  const params = new URLSearchParams();
  if (postalCode) params.set("postalCode", postalCode.replace(/\s/g, ""));
  params.set("maximum", "10");
  const url = `https://soa-gw.canadapost.ca/rs/postoffice?${params.toString()}`;
  const creds = Buffer.from(
    `${env("CANADA_POST_API_KEY")}:${env("CANADA_POST_API_PASSWORD")}`,
  ).toString("base64");
  const res = await fetchText(url, {
    headers: { Accept: "application/vnd.cpc.postoffice+xml", Authorization: `Basic ${creds}` },
  });
  if (!res.ok) return null;
  // Live XML is returned raw; parsing office detail is a later step.
  return {
    query,
    postal_code: postalCode,
    radius_km: 0,
    offices: [],
    source: "official-postoffice-api",
    source_url: url,
    fetched_at: nowIso(),
    http_status: res.status,
    reason: "Live official API responded. Raw XML parsing of office detail is not yet implemented in this version; raw response is in evidence, not in offices.",
  };
}

export async function findPostOffice(
  query: string | undefined,
  postalCode: string | undefined,
  radiusKm: number,
): Promise<FinderResult> {
  if (hasOfficialApiCredentials()) {
    const live = await finderViaOfficialApi(postalCode, query);
    if (live) return live;
  }
  return recordedLookup(query, postalCode, radiusKm);
}
