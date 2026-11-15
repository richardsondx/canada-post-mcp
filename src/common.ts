// Shared helpers for the Canada Post MCP tools.
// Every tool result carries a source URL and a fetched_at timestamp.
// Nothing here invents a parcel status, a rate, or an address.

export function nowIso(): string {
  return new Date().toISOString();
}

export function trackPageUrl(pin: string): string {
  return `https://www.canadapost-postescanada.ca/track-reperage/en#/result/${encodeURIComponent(pin)}`;
}

export function publicTrackJsonUrl(pin: string): string {
  return `https://www.canadapost-postescanada.ca/track-reperage/rs/track/json/package?pins=${encodeURIComponent(pin)}`;
}

export function findARateUrl(): string {
  return "https://www.canadapost-postescanada.ca/cpc/en/tools/find-a-rate.page";
}

export function findPostOfficeUrl(): string {
  return "https://www.canadapost-postescanada.ca/cpc/en/tools/find-a-post-office.page";
}

export function myMailUrl(): string {
  return "https://www.canadapost-postescanada.ca/cpc/en/personal/mymail.page";
}

export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
}

/** Fetch with a browser user agent and a short timeout. Never throws on HTTP error status. */
export async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": BROWSER_UA, ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    // Network failure (DNS, reset, timeout). Never throw: callers report it.
    return { ok: false, status: 0, text: `fetch failed: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Canada Post postal code: A1A 1A1 (space optional, case-insensitive). */
export function isValidCanadianPostalCode(value: string): boolean {
  return /^[A-Za-z]\d[A-Za-z][ ]?\d[A-Za-z]\d$/.test(value.trim());
}

export function normalizePostalCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Canada Post tracking numbers, per Canada Post public guidance:
 * - 16 digits for many domestic parcels (example shape 1234 5678 9123 4567)
 * - 13 digits for older domestic numbers
 * - 20 digits, as in the public Shopify docs example 01189998819991197253
 * - 13 characters, S10 shape: 2 letters + 9 digits + 2 letters, ending in CA
 * - 15 digits for a Delivery Notice Card number
 * Spaces and dashes are formatting only.
 */
export function isValidTrackingNumber(value: string): boolean {
  const v = value.trim().toUpperCase().replace(/[\s-]/g, "");
  if (/^\d{16}$/.test(v)) return true;
  if (/^\d{13}$/.test(v)) return true;
  if (/^\d{20}$/.test(v)) return true;
  if (/^\d{15}$/.test(v)) return true;
  if (/^[A-Z]{2}\d{9}CA$/.test(v)) return true;
  return false;
}

export function normalizeTrackingNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/** True only when the official Developer Program credentials are present. */
export function hasOfficialApiCredentials(): boolean {
  return Boolean(env("CANADA_POST_API_KEY") && env("CANADA_POST_API_PASSWORD"));
}

/** True only when the Developer Portal OAuth credentials are present. */
export function hasDevPortalCredentials(): boolean {
  return Boolean(env("CANADA_POST_DEVPORTAL_KEY") && env("CANADA_POST_DEVPORTAL_SECRET"));
}

export const DEVPORTAL_BASE = "https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs";
export const DEVPORTAL_TOKEN_URL = `${DEVPORTAL_BASE}/cpc-api-native-oauth-provider/oauth2/token`;

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Get a DevPortal OAuth token with client_credentials, scope merchant. Caches it for 50 minutes. */
export async function getDevPortalToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const key = env("CANADA_POST_DEVPORTAL_KEY");
  const secret = env("CANADA_POST_DEVPORTAL_SECRET");
  if (!key || !secret) return null;
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetchText(DEVPORTAL_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`,
    },
    body: "grant_type=client_credentials&scope=merchant",
  });
  if (!res.ok) return null;
  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(res.text);
  } catch {
    return null;
  }
  if (!data.access_token) return null;
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return data.access_token;
}
