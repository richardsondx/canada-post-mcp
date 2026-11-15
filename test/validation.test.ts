import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidCanadianPostalCode,
  isValidTrackingNumber,
  normalizePostalCode,
  normalizeTrackingNumber,
} from "../src/common.js";
import { RECORDED_DIRECTORY, haversineKm } from "../src/offices.js";

test("tracking numbers: 16 digits pass", () => {
  assert.equal(isValidTrackingNumber("1234567890123456"), true);
  assert.equal(isValidTrackingNumber("1234 5678 9123 4567"), true);
  assert.equal(isValidTrackingNumber("01189998819991197253"), true);
});

test("tracking numbers: S10 codes ending in CA pass", () => {
  assert.equal(isValidTrackingNumber("LM217656065CA"), true);
  assert.equal(isValidTrackingNumber("AA123456789CA"), true);
});

test("tracking numbers: 15-digit Delivery Notice Card numbers pass", () => {
  assert.equal(isValidTrackingNumber("123456789012345"), true);
});

test("tracking numbers: junk fails", () => {
  assert.equal(isValidTrackingNumber("abc"), false);
  assert.equal(isValidTrackingNumber("123"), false);
  assert.equal(isValidTrackingNumber("12345678901234567"), false);
  assert.equal(isValidTrackingNumber("LM217656065US"), false);
});

test("tracking numbers: normalize strips spaces and dashes, uppercases", () => {
  assert.equal(normalizeTrackingNumber(" lm217656065ca "), "LM217656065CA");
  assert.equal(normalizeTrackingNumber("1234-5678-9123-4567"), "1234567891234567");
});

test("postal codes: valid Canadian codes pass", () => {
  assert.equal(isValidCanadianPostalCode("M5G 1N6"), true);
  assert.equal(isValidCanadianPostalCode("V6B1A1"), true);
  assert.equal(isValidCanadianPostalCode("k1a 0b1"), true);
});

test("postal codes: junk fails", () => {
  assert.equal(isValidCanadianPostalCode("12345"), false);
  assert.equal(isValidCanadianPostalCode("M5G 1N"), false);
  assert.equal(isValidCanadianPostalCode(""), false);
});

test("postal codes: normalize uppercases and single-spaces", () => {
  assert.equal(normalizePostalCode("m5g1n6"), "M5G1N6");
  assert.equal(normalizePostalCode(" m5g  1n6 "), "M5G 1N6");
});

test("recorded directory: every office has a real street address in Toronto", () => {
  assert.ok(RECORDED_DIRECTORY.length >= 5);
  for (const office of RECORDED_DIRECTORY) {
    assert.match(office.address, /\d+\s+\S+/);
    assert.equal(office.city, "Toronto");
    assert.equal(office.province, "ON");
    assert.ok(Number.isFinite(office.latitude) && Number.isFinite(office.longitude));
  }
});

test("haversine: downtown Toronto offices sit within a few km of the centre", () => {
  for (const office of RECORDED_DIRECTORY) {
    const d = haversineKm(43.65, -79.38, office.latitude, office.longitude);
    assert.ok(d < 5, `${office.address} is ${d} km away`);
  }
});
