// get_rates: Canada Post shipping rates.
// Route order:
// 1. Official Rating API (needs free Developer Program key in env) - authenticated fallback.
// 2. Public Find a Rate page check - the web calculator needs a browser session; no key exists.
// 3. Honest failure: no rate is ever invented.
import {
  DEVPORTAL_BASE,
  env,
  fetchText,
  findARateUrl,
  getDevPortalToken,
  hasDevPortalCredentials,
  hasOfficialApiCredentials,
  nowIso,
} from "./common.js";

export interface RateRequest {
  origin_postal_code: string;
  destination_postal_code: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
}

export interface RateResult {
  origin_postal_code: string;
  destination_postal_code: string;
  weight_kg: number;
  dimensions_cm: { length_cm: number; width_cm: number; height_cm: number };
  currency: string;
  rates?: Array<{ service_name?: string; service_code?: string; price?: string; transit_days?: string; expected_delivery_date?: string; raw?: unknown }>;
  source: string;
  source_url: string;
  fetched_at: string;
  http_status?: number;
  reason?: string;
  raw?: unknown;
}

function ratingXml(req: RateRequest): string {
  const customer = env("CANADA_POST_CUSTOMER_NUMBER");
  const customerEl = customer
    ? `<customer-number>${customer}</customer-number>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<mailing-scenario xmlns="http://www.canadapost.ca/ws/ship/rate-v4">
  ${customerEl}
  <parcel-characteristics>
    <weight>${req.weight_kg}</weight>
    <dimensions>
      <length>${req.length_cm}</length>
      <width>${req.width_cm}</width>
      <height>${req.height_cm}</height>
    </dimensions>
  </parcel-characteristics>
  <origin-postal-code>${req.origin_postal_code.replace(/\s/g, "")}</origin-postal-code>
  <destination>
    <domestic>
      <postal-code>${req.destination_postal_code.replace(/\s/g, "")}</postal-code>
    </domestic>
  </destination>
</mailing-scenario>`;
}

function parseRateXml(xml: string): RateResult["rates"] {
  const rates: NonNullable<RateResult["rates"]> = [];
  const blocks = xml.match(/<price-quote>[\s\S]*?<\/price-quote>/gi) ?? [];
  for (const block of blocks) {
    const pick = (tag: string): string | undefined => {
      const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
      return m ? m[1].trim() : undefined;
    };
    rates.push({
      service_name: pick("service-name"),
      service_code: pick("service-code"),
      price: pick("due"),
      transit_days: pick("transit-time"),
      expected_delivery_date: pick("expected-delivery-date"),
    });
  }
  return rates;
}

async function ratesViaOfficialApi(req: RateRequest): Promise<RateResult> {
  const url = "https://soa-gw.canadapost.ca/rs/ship/price";
  const creds = Buffer.from(
    `${env("CANADA_POST_API_KEY")}:${env("CANADA_POST_API_PASSWORD")}`,
  ).toString("base64");
  const res = await fetchText(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.cpc.ship.rate-v4+xml",
      "Content-Type": "application/vnd.cpc.ship.rate-v4+xml",
      Authorization: `Basic ${creds}`,
    },
    body: ratingXml(req),
  });
  const base: RateResult = {
    ...req,
    dimensions_cm: { length_cm: req.length_cm, width_cm: req.width_cm, height_cm: req.height_cm },
    currency: "CAD",
    source: "official-rating-api",
    source_url: url,
    fetched_at: nowIso(),
    http_status: res.status,
  };
  if (!res.ok) {
    return {
      ...base,
      reason: `Official Rating API returned HTTP ${res.status}. Check CANADA_POST_API_KEY, CANADA_POST_API_PASSWORD, and CANADA_POST_CUSTOMER_NUMBER.`,
    };
  }
  return { ...base, rates: parseRateXml(res.text), raw: res.text.slice(0, 4000) };
}

async function ratesViaDevPortal(req: RateRequest): Promise<RateResult> {
  const base: RateResult = {
    ...req,
    dimensions_cm: { length_cm: req.length_cm, width_cm: req.width_cm, height_cm: req.height_cm },
    currency: "CAD",
    source: "devportal-rating-api",
    source_url: `${DEVPORTAL_BASE}/rating/v1/prices`,
    fetched_at: nowIso(),
  };
  const token = await getDevPortalToken();
  if (!token) {
    return { ...base, http_status: 401, reason: "DevPortal token call failed. Check CANADA_POST_DEVPORTAL_KEY and CANADA_POST_DEVPORTAL_SECRET." };
  }
  const customer = env("CANADA_POST_CUSTOMER_NUMBER");
  const contract = env("CANADA_POST_CONTRACT_NUMBER");
  const body: Record<string, unknown> = {
    originPostalCode: req.origin_postal_code.replace(/\s/g, ""),
    destination: { countryCode: "CA", postalCode: req.destination_postal_code.replace(/\s/g, "") },
    parcelCharacteristics: {
      weight: req.weight_kg,
      dimensions: { length: req.length_cm, width: req.width_cm, height: req.height_cm },
      document: false,
      unpackaged: false,
      mailingTube: false,
      oversized: false,
    },
  };
  if (customer) body.customerNumber = customer;
  if (contract) body.contractNumber = contract;
  const res = await fetchText(`${DEVPORTAL_BASE}/rating/v1/prices`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": "en-CA",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    let data: any;
    try {
      data = JSON.parse(res.text);
    } catch {
      return { ...base, http_status: res.status, reason: "DevPortal Rating API returned a non-JSON response. No rate was invented." };
    }
    const quotes = data?.priceQuotes?.priceQuote ?? [];
    const rates = quotes.map((q: any) => ({
      service_name: q.serviceName,
      service_code: q.serviceCode,
      price: q.totalPriceIncludingOptions != null ? String(q.totalPriceIncludingOptions) : q.basePrice != null ? String(q.basePrice) : undefined,
      transit_days: q.serviceStandard?.expectedTransitTime != null ? String(q.serviceStandard.expectedTransitTime) : undefined,
      expected_delivery_date: q.serviceStandard?.deliveryDate,
    }));
    return { ...base, http_status: res.status, rates, raw: data };
  }
  // Prices endpoint rejected the body. Fall back to the services list, which
  // proves the Rating API works and names the services, without inventing a price.
  const servicesRes = await fetchText(`${DEVPORTAL_BASE}/rating/v1/services?country=CA`, {
    headers: { Accept: "application/json", "Accept-Language": "en-CA", Authorization: `Bearer ${token}` },
  });
  if (!servicesRes.ok) {
    return { ...base, http_status: res.status, reason: `DevPortal Rating prices returned HTTP ${res.status}, and the services list returned HTTP ${servicesRes.status}. No rate was invented.` };
  }
  let services: any[];
  try {
    services = JSON.parse(servicesRes.text);
  } catch {
    return { ...base, http_status: res.status, reason: "DevPortal Rating services list returned a non-JSON response. No rate was invented." };
  }
  return {
    ...base,
    http_status: servicesRes.status,
    source: "devportal-rating-services",
    source_url: `${DEVPORTAL_BASE}/rating/v1/services`,
    rates: services.map((s: any) => ({ service_name: s.serviceName, service_code: s.serviceCode })),
    reason: `DevPortal Rating prices returned HTTP ${res.status} (schema validation), so no price was returned. The services list returned ${services.length} services. No price was invented.`,
  };
}

export async function getRates(req: RateRequest): Promise<RateResult> {
  if (hasDevPortalCredentials()) return ratesViaDevPortal(req);
  if (hasOfficialApiCredentials()) return ratesViaOfficialApi(req);
  // No key: the public Find a Rate calculator is a browser app with no public
  // JSON endpoint. Confirm the page loads, then report honestly.
  const page = await fetchText(findARateUrl());
  return {
    ...req,
    dimensions_cm: { length_cm: req.length_cm, width_cm: req.width_cm, height_cm: req.height_cm },
    currency: "CAD",
    source: "public-find-a-rate-page",
    source_url: findARateUrl(),
    fetched_at: nowIso(),
    http_status: page.status,
    reason:
      "No Canada Post API credentials are configured, and the public Find a Rate calculator has no public JSON endpoint. " +
      "No rate was invented. Set CANADA_POST_API_KEY, CANADA_POST_API_PASSWORD, and CANADA_POST_CUSTOMER_NUMBER " +
      "from the free Canada Post Developer Program for live rates, or use the web calculator at the source URL in a browser.",
  };
}
