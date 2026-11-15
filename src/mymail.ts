// list_mymail: MyMail incoming-mail list. LOCAL ONLY, OPT-IN, NO LOGIN.
// This server never logs in to a Canada Post account and never scrapes with a
// hardcoded account. Three modes, in order:
// 1. Mock mode: CANADA_POST_MyMAIL_ENABLED=true and CANADA_POST_MyMAIL_MOCK=true.
//    Returns clearly labelled sample items. Used by tests. No login.
// 2. Local export file: CANADA_POST_MyMAIL_EXPORT_FILE points at a JSON file the
//    user saved themselves from the Canada Post app. Read locally only.
// 3. Not configured: fail cleanly with a clear message.
import { env, myMailUrl, nowIso } from "./common.js";
import { readFile } from "node:fs/promises";

export interface MyMailItem {
  id: string;
  sender: string;
  type: string;
  expected_date?: string;
  status: string;
  mock: boolean;
}

export interface MyMailResult {
  configured: boolean;
  mode: "mock" | "local-export" | "not-configured";
  items: MyMailItem[];
  source: string;
  source_url: string;
  fetched_at: string;
  reason?: string;
}

const MOCK_ITEMS: MyMailItem[] = [
  { id: "mock-001", sender: "Provincebank (sample)", type: "Lettermail", expected_date: "2026-11-12", status: "arriving-soon", mock: true },
  { id: "mock-002", sender: "General mail (sample)", type: "Personalized Mail", expected_date: "2026-11-12", status: "out-for-delivery", mock: true },
  { id: "mock-003", sender: "City Notices (sample)", type: "Neighbourhood Mail", expected_date: "2026-11-13", status: "arriving-soon", mock: true },
];

export const NOT_CONFIGURED_MESSAGE =
  "MyMail is not configured. MyMail is opt-in and local only. " +
  "Set CANADA_POST_MyMAIL_ENABLED=true and CANADA_POST_MyMAIL_MOCK=true for mock mode, " +
  "or set CANADA_POST_MyMAIL_EXPORT_FILE to a JSON file you saved yourself from the Canada Post app. " +
  "This server never logs in to a Canada Post account.";

export async function listMyMail(limit: number): Promise<MyMailResult> {
  const base = { source_url: myMailUrl(), fetched_at: nowIso() };
  const enabled = env("CANADA_POST_MyMAIL_ENABLED") === "true";
  const mock = env("CANADA_POST_MyMAIL_MOCK") === "true";
  if (enabled && mock) {
    return {
      configured: true,
      mode: "mock",
      items: MOCK_ITEMS.slice(0, limit),
      source: "mock",
      ...base,
      reason: "Mock mode. Sample items only. No live login, no real mail data.",
    };
  }
  const exportFile = env("CANADA_POST_MyMAIL_EXPORT_FILE");
  if (enabled && exportFile) {
    try {
      const raw = await readFile(exportFile, "utf-8");
      const parsed = JSON.parse(raw) as { items?: MyMailItem[] };
      const items = (parsed.items ?? []).slice(0, limit).map((i) => ({ ...i, mock: false }));
      return { configured: true, mode: "local-export", items, source: "local-export-file", ...base };
    } catch (err) {
      return {
        configured: false,
        mode: "not-configured",
        items: [],
        source: "local-export-file",
        ...base,
        reason: `Could not read CANADA_POST_MyMAIL_EXPORT_FILE (${exportFile}): ${(err as Error).message}`,
      };
    }
  }
  return {
    configured: false,
    mode: "not-configured",
    items: [],
    source: "not-configured",
    ...base,
    reason: NOT_CONFIGURED_MESSAGE,
  };
}
