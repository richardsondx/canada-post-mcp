import test from "node:test";
import assert from "node:assert/strict";
import { listMyMail, NOT_CONFIGURED_MESSAGE } from "../src/mymail.js";

// No live login happens in any test in this file. Mock mode uses sample data only.

test("list_mymail: mock mode returns labelled sample items, no live login", async () => {
  process.env.CANADA_POST_MyMAIL_ENABLED = "true";
  process.env.CANADA_POST_MyMAIL_MOCK = "true";
  try {
    const result = await listMyMail(2);
    assert.equal(result.configured, true);
    assert.equal(result.mode, "mock");
    assert.equal(result.items.length, 2);
    for (const item of result.items) {
      assert.equal(item.mock, true);
      assert.ok(item.sender.length > 0);
      assert.ok(item.type.length > 0);
    }
    assert.ok(result.source_url.includes("mymail"));
    assert.ok(result.fetched_at.length > 0);
  } finally {
    delete process.env.CANADA_POST_MyMAIL_ENABLED;
    delete process.env.CANADA_POST_MyMAIL_MOCK;
  }
});

test("list_mymail: mock mode respects the limit", async () => {
  process.env.CANADA_POST_MyMAIL_ENABLED = "true";
  process.env.CANADA_POST_MyMAIL_MOCK = "true";
  try {
    const result = await listMyMail(1);
    assert.equal(result.items.length, 1);
  } finally {
    delete process.env.CANADA_POST_MyMAIL_ENABLED;
    delete process.env.CANADA_POST_MyMAIL_MOCK;
  }
});

test("list_mymail: with no config it fails cleanly with a clear message", async () => {
  delete process.env.CANADA_POST_MyMAIL_ENABLED;
  delete process.env.CANADA_POST_MyMAIL_MOCK;
  delete process.env.CANADA_POST_MyMAIL_EXPORT_FILE;
  const result = await listMyMail(5);
  assert.equal(result.configured, false);
  assert.equal(result.mode, "not-configured");
  assert.deepEqual(result.items, []);
  assert.equal(result.reason, NOT_CONFIGURED_MESSAGE);
  assert.match(result.reason ?? "", /not configured/i);
  assert.match(result.reason ?? "", /never logs in/i);
});

test("list_mymail: enabled without mock and without an export file also fails cleanly", async () => {
  process.env.CANADA_POST_MyMAIL_ENABLED = "true";
  delete process.env.CANADA_POST_MyMAIL_MOCK;
  delete process.env.CANADA_POST_MyMAIL_EXPORT_FILE;
  try {
    const result = await listMyMail(5);
    assert.equal(result.configured, false);
    assert.equal(result.items.length, 0);
  } finally {
    delete process.env.CANADA_POST_MyMAIL_ENABLED;
  }
});
