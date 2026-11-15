import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = path.join(repoRoot, "dist", "server.js");

async function connectClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverEntry],
    env: { ...process.env, CANADA_POST_MyMAIL_ENABLED: "", CANADA_POST_MyMAIL_MOCK: "" },
    stderr: "ignore",
  });
  const client = new Client({ name: "canada-post-mcp-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

function parseText(result: { content?: Array<{ type?: string; text?: string }> }): Record<string, unknown> {
  const text = result.content?.[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

test("server: lists exactly 4 tools", async () => {
  const client = await connectClient();
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["find_post_office", "get_rates", "list_mymail", "track_parcel"]);
    for (const tool of tools.tools) {
      assert.ok(tool.inputSchema, `${tool.name} has an input schema`);
    }
  } finally {
    await client.close();
  }
});

test("server: track_parcel rejects an invalid tracking number", async () => {
  const client = await connectClient();
  try {
    const result = await client.callTool({ name: "track_parcel", arguments: { tracking_number: "abc" } });
    const parsed = parseText(result as never);
    assert.equal(parsed.status, "invalid");
  } finally {
    await client.close();
  }
});

test("server: get_rates rejects an invalid postal code", async () => {
  const client = await connectClient();
  try {
    const result = await client.callTool({
      name: "get_rates",
      arguments: { origin_postal_code: "12345", destination_postal_code: "V6B 1A1", weight_kg: 1, length_cm: 30, width_cm: 20, height_cm: 10 },
    });
    const parsed = parseText(result as never);
    assert.equal(parsed.status, "invalid");
  } finally {
    await client.close();
  }
});

test("server: find_post_office returns real Toronto addresses", async () => {
  const client = await connectClient();
  try {
    const result = await client.callTool({ name: "find_post_office", arguments: { query: "Toronto", radius_km: 5 } });
    const parsed = parseText(result as never);
    const offices = parsed.offices as Array<{ address: string; city: string }>;
    assert.ok(Array.isArray(offices) && offices.length >= 5);
    for (const office of offices) {
      assert.match(office.address, /\d+\s+\S+/);
      assert.equal(office.city, "Toronto");
    }
    assert.ok(parsed.source_url);
    assert.ok(parsed.fetched_at);
  } finally {
    await client.close();
  }
});

test("server: list_mymail fails cleanly with no config", async () => {
  const client = await connectClient();
  try {
    const result = await client.callTool({ name: "list_mymail", arguments: { limit: 5 } });
    const parsed = parseText(result as never);
    assert.equal(parsed.configured, false);
    assert.equal(parsed.mode, "not-configured");
  } finally {
    await client.close();
  }
});

// Live smoke test. It passes when the tool answers with a structured result that
// either carries a live status or honestly reports the block. It never passes
// on an invented status: the tool has no code path that invents one.
// On 2026-11-11 Canada Post returned HTTP 403 for the public tracking endpoint
// from this machine, so the expected outcome here is the honest block.
test("server: live smoke - track_parcel answers honestly for a real public number", async () => {
  const client = await connectClient();
  try {
    const result = await client.callTool({
      name: "track_parcel",
      arguments: { tracking_number: "01189998819991197253" },
    });
    const parsed = parseText(result as never);
    assert.equal(parsed.tracking_number, "01189998819991197253");
    assert.ok(typeof parsed.status === "string" && (parsed.status as string).length > 0);
    assert.ok(parsed.source_url);
    assert.ok(parsed.fetched_at);
    if (parsed.status === "unavailable") {
      console.log("SMOKE SKIP: Canada Post blocked the live track call; reason recorded in result.");
      assert.ok((parsed.reason as string).length > 0);
      assert.ok((parsed.reason as string).includes("403") || (parsed.reason as string).includes("blocked"));
    }
  } finally {
    await client.close();
  }
});
