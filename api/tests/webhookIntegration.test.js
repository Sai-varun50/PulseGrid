const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  createWebhookAuth,
} = require("../src/middleware/webhookAuth");

const SECRET = "test-webhook-secret";

function createMockResponse() {
  return {
    statusCode: null,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createMockRequest({
  apiKey = "test-api-key",
  signature,
  timestamp,
  rawBody,
} = {}) {
  return {
    get(name) {
      const headers = {
        "X-API-Key": apiKey,
        "X-Signature": signature,
        "X-Timestamp": timestamp,
      };

      return headers[name];
    },

    rawBody,
  };
}

test("rejects missing webhook authentication headers", async () => {
  const middleware = createWebhookAuth({
    secretResolver: async () => SECRET,
    apiKeyResolver: async () => null,
  });

  const req = createMockRequest({
    apiKey: undefined,
    signature: undefined,
    timestamp: undefined,
  });

  const res = createMockResponse();

  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("rejects stale timestamp", async () => {
  const middleware = createWebhookAuth({
    secretResolver: async () => SECRET,
    apiKeyResolver: async () => null,
  });

  const staleTimestamp = String(
    Math.floor(Date.now() / 1000) - 301
  );

  const req = {
    get(name) {
      const headers = {
        "X-API-Key": "test-api-key",
        "X-Signature": "00".repeat(32),
        "X-Timestamp": staleTimestamp,
      };

      return headers[name];
    },

    rawBody: Buffer.from("{}"),
  };

  const res = createMockResponse();

  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 400);
  assert.equal(nextCalled, false);
  assert.equal(res.body.error.code, "STALE_TIMESTAMP");
});

test("rejects invalid API key", async () => {
  const middleware = createWebhookAuth({
    secretResolver: async () => SECRET,
    apiKeyResolver: async () => null,
  });

  const body = Buffer.from(
    JSON.stringify({
      service_id: 42,
      title: "Test incident",
    })
  );

  const timestamp = String(
    Math.floor(Date.now() / 1000)
  );

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(body)
    .digest("hex");

  const req = createMockRequest({
    apiKey: "invalid-api-key",
    signature,
    timestamp,
    rawBody: body,
  });

  const res = createMockResponse();

  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("rejects revoked API key", async () => {
  const middleware = createWebhookAuth({
    secretResolver: async () => SECRET,
    apiKeyResolver: async () => null,
  });

  const body = Buffer.from(
    JSON.stringify({
      service_id: 42,
      title: "Test incident",
    })
  );

  const timestamp = String(
    Math.floor(Date.now() / 1000)
  );

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(body)
    .digest("hex");

  const req = createMockRequest({
    apiKey: "revoked-api-key",
    signature,
    timestamp,
    rawBody: body,
  });

  const res = createMockResponse();

  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("accepts a valid API key and HMAC signature", async () => {
  const body = Buffer.from(
    JSON.stringify({
      service_id: 42,
      title: "Checkout API returning 5xx",
      severity: "high",
      fingerprint: "checkout-api-5xx-errors",
    })
  );

  const timestamp = String(
    Math.floor(Date.now() / 1000)
  );

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(body)
    .digest("hex");

  const middleware = createWebhookAuth({
    secretResolver: async () => SECRET,

    apiKeyResolver: async (plaintextKey) => {
      if (plaintextKey !== "valid-api-key") {
        return null;
      }

      return {
        id: 123,
        org_id: 42,
        scopes: ["webhook:write"],
      };
    },
  });

  const req = createMockRequest({
    apiKey: "valid-api-key",
    signature,
    timestamp,
    rawBody: body,
  });

  const res = createMockResponse();

  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);

  assert.deepEqual(req.webhookAuth, {
    apiKeyId: 123,
    orgId: 42,
    scopes: ["webhook:write"],
  });
});