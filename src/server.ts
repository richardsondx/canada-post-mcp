// canada-post-mcp: UNOFFICIAL MCP server for Canada Post.
// Not affiliated with or endorsed by Canada Post Corporation.
// Stdio transport. One start command: npm install && npm run build && npm start.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  isPositiveNumber,
  isValidCanadianPostalCode,
  isValidTrackingNumber,
  normalizePostalCode,
  normalizeTrackingNumber,
  nowIso,
} from "./common.js";
import { trackParcel } from "./track.js";
import { getRates } from "./rates.js";
import { findPostOffice } from "./offices.js";
import { listMyMail } from "./mymail.js";

const server = new McpServer({
  name: "canada-post-mcp",
  version: "0.1.0",
});

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

server.tool(
  "track_parcel",
  "Track a Canada Post parcel by tracking number. Returns the live status from Canada Post public tracking, or an honest error when Canada Post blocks the request. Never invents a status.",
  { tracking_number: z.string().describe("Canada Post tracking number: 16 digits, 15-digit Delivery Notice Card number, or 13-character S10 code ending in CA.") },
  async ({ tracking_number }) => {
    const pin = normalizeTrackingNumber(tracking_number);
    if (!isValidTrackingNumber(pin)) {
      return textResult({
        tracking_number: pin,
        status: "invalid",
        error: "Invalid tracking number format. Use 16 digits, a 15-digit Delivery Notice Card number, or a 13-character code ending in CA.",
        fetched_at: nowIso(),
      });
    }
    return textResult(await trackParcel(pin));
  },
);

server.tool(
  "get_rates",
  "Get Canada Post shipping rates for a parcel route. Needs official Developer Program credentials in env for live rates; without them it reports honestly and links the public Find a Rate calculator. Never invents a rate.",
  {
    origin_postal_code: z.string().describe("Origin Canadian postal code, e.g. M5G 1N6."),
    destination_postal_code: z.string().describe("Destination Canadian postal code, e.g. V6B 1A1."),
    weight_kg: z.number().describe("Parcel weight in kilograms."),
    length_cm: z.number().describe("Parcel length in centimetres."),
    width_cm: z.number().describe("Parcel width in centimetres."),
    height_cm: z.number().describe("Parcel height in centimetres."),
  },
  async (args) => {
    const origin = normalizePostalCode(args.origin_postal_code);
    const destination = normalizePostalCode(args.destination_postal_code);
    if (!isValidCanadianPostalCode(origin) || !isValidCanadianPostalCode(destination)) {
      return textResult({ status: "invalid", error: "Both postal codes must be valid Canadian postal codes (A1A 1A1).", fetched_at: nowIso() });
    }
    for (const [name, v] of [["weight_kg", args.weight_kg], ["length_cm", args.length_cm], ["width_cm", args.width_cm], ["height_cm", args.height_cm]] as const) {
      if (!isPositiveNumber(v)) {
        return textResult({ status: "invalid", error: `${name} must be a positive number.`, fetched_at: nowIso() });
      }
    }
    return textResult(await getRates({ origin_postal_code: origin, destination_postal_code: destination, weight_kg: args.weight_kg, length_cm: args.length_cm, width_cm: args.width_cm, height_cm: args.height_cm }));
  },
);

server.tool(
  "find_post_office",
  "Find Canada Post post offices near a place or postal code. Each result has a real address. Without API credentials it uses a recorded directory of real downtown Toronto offices, labelled as recorded data.",
  {
    query: z.string().optional().describe("Place or city name, e.g. Toronto."),
    postal_code: z.string().optional().describe("Canadian postal code near the search area, e.g. M5G 1N6."),
    radius_km: z.number().optional().describe("Search radius in kilometres. Default 5."),
  },
  async ({ query, postal_code, radius_km }) => {
    const radius = radius_km ?? 5;
    if (!query && !postal_code) {
      return textResult({ status: "invalid", error: "Provide query or postal_code.", fetched_at: nowIso() });
    }
    if (postal_code && !isValidCanadianPostalCode(postal_code)) {
      return textResult({ status: "invalid", error: "postal_code must be a valid Canadian postal code (A1A 1A1).", fetched_at: nowIso() });
    }
    if (!isPositiveNumber(radius) || radius > 100) {
      return textResult({ status: "invalid", error: "radius_km must be a positive number up to 100.", fetched_at: nowIso() });
    }
    return textResult(await findPostOffice(query, postal_code ? normalizePostalCode(postal_code) : undefined, radius));
  },
);

server.tool(
  "list_mymail",
  "List incoming mail from Canada Post MyMail. LOCAL ONLY and OPT-IN. Returns mock sample items only when CANADA_POST_MyMAIL_ENABLED=true and CANADA_POST_MyMAIL_MOCK=true, or items from a local export file you saved yourself. Fails cleanly when not configured. Never logs in.",
  { limit: z.number().optional().describe("Maximum items to return. Default 10.") },
  async ({ limit }) => {
    const n = limit ?? 10;
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return textResult({ status: "invalid", error: "limit must be an integer from 1 to 50.", fetched_at: nowIso() });
    }
    return textResult(await listMyMail(n));
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("canada-post-mcp (UNOFFICIAL) started on stdio. Tools: track_parcel, get_rates, find_post_office, list_mymail.");
}

main().catch((err) => {
  console.error("canada-post-mcp failed to start:", err);
  process.exit(1);
});
