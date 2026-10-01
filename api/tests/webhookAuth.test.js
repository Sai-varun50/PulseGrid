const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  isFreshTimestamp,
  computeSignature,
  signaturesMatch,
} = require("../src/middleware/webhookAuth");

const secret = "test-webhook-secret";

const body = Buffer.from(
  JSON.stringify({
    service_id: 42,
    title: "Checkout API returning 5xx",
    severity: "high",
    fingerprint: "checkout-api-5xx-errors",
  })
);

test("accepts a fresh timestamp", () => {
  const now = 1700000000;

  assert.equal(
    isFreshTimestamp(String(now), now),
    true
  );
});

test("rejects a timestamp older than 5 minutes", () => {
  const now = 1700000000;
  const stale = now - 301;

  assert.equal(
    isFreshTimestamp(String(stale), now),
    false
  );
});

test("rejects a timestamp newer than 5 minutes", () => {
  const now = 1700000000;
  const future = now + 301;

  assert.equal(
    isFreshTimestamp(String(future), now),
    false
  );
});

test("rejects a non-numeric timestamp", () => {
  assert.equal(
    isFreshTimestamp("not-a-timestamp", 1700000000),
    false
  );
});

test("generates an HMAC-SHA256 signature", () => {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  assert.equal(
    computeSignature(secret, body),
    expected
  );
});

test("accepts a correct signature", () => {
  const signature = computeSignature(secret, body);

  assert.equal(
    signaturesMatch(signature, signature),
    true
  );
});

test("rejects a modified signature", () => {
  const signature = computeSignature(secret, body);
  const modified = `${signature.slice(0, -2)}00`;

  assert.equal(
    signaturesMatch(signature, modified),
    false
  );
});

test("rejects a signature with the wrong length", () => {
  assert.equal(
    signaturesMatch("abcd", "abcd"),
    false
  );
});

test("rejects a signature with invalid hex", () => {
  const invalid = "z".repeat(64);

  assert.equal(
    signaturesMatch(invalid, invalid),
    false
  );
});

test("modified request body produces a different signature", () => {
  const originalSignature = computeSignature(secret, body);

  const modifiedBody = Buffer.from(
    JSON.stringify({
      service_id: 42,
      title: "Modified incident",
      severity: "high",
      fingerprint: "checkout-api-5xx-errors",
    })
  );

  const modifiedSignature = computeSignature(
    secret,
    modifiedBody
  );

  assert.notEqual(
    modifiedSignature,
    originalSignature
  );
});