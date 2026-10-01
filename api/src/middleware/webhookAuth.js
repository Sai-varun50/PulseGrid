const crypto = require("node:crypto");
const db = require("../lib/db");
const { verifyApiKey } = require("../services/apiKeyService");

const TIMESTAMP_TOLERANCE_SECONDS = Number(
  process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS || 300
);

function isFreshTimestamp(
  timestampHeader,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!/^\d+$/.test(timestampHeader || "")) {
    return false;
  }

  const timestamp = Number(timestampHeader);

  return (
    Number.isSafeInteger(timestamp) &&
    Math.abs(nowSeconds - timestamp) <= TIMESTAMP_TOLERANCE_SECONDS
  );
}

function computeSignature(secret, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
}

function signaturesMatch(expectedHex, suppliedHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(suppliedHex || "")) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const supplied = Buffer.from(suppliedHex, "hex");

  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

async function findActiveApiKey(plaintextKey) {
  if (!plaintextKey) {
    return null;
  }

  const rows = await db("api_keys")
    .select("id", "org_id", "key_hash", "scopes")
    .whereNull("revoked_at");

  for (const row of rows) {
    if (await verifyApiKey(row.key_hash, plaintextKey)) {
      return row;
    }
  }

  return null;
}

function createWebhookAuth({
  secretResolver,
  apiKeyResolver = findActiveApiKey,
}) {
  if (typeof secretResolver !== "function") {
    throw new TypeError("secretResolver must be a function");
  }

  return async function webhookAuth(req, res, next) {
    const apiKey = req.get("X-API-Key");
    const signature = req.get("X-Signature");
    const timestamp = req.get("X-Timestamp");

    if (!apiKey || !signature || !timestamp) {
      return res.status(401).json({
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing webhook authentication headers.",
        },
      });
    }

    if (!isFreshTimestamp(timestamp)) {
      return res.status(400).json({
        data: null,
        error: {
          code: "STALE_TIMESTAMP",
          message: "Webhook timestamp is outside the allowed window.",
        },
      });
    }

    try {
      const apiKeyRow = await apiKeyResolver(apiKey);

      if (!apiKeyRow) {
        return res.status(401).json({
          data: null,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid webhook credentials.",
          },
        });
      }

      const secret = await secretResolver(apiKeyRow, req);

      if (!secret) {
        throw new Error("Webhook secret resolver returned no secret");
      }

      const rawBody = req.rawBody;

      if (!Buffer.isBuffer(rawBody)) {
        throw new Error("Webhook raw body is unavailable");
      }

      const expectedSignature = computeSignature(secret, rawBody);

      if (!signaturesMatch(expectedSignature, signature)) {
        return res.status(401).json({
          data: null,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid webhook signature.",
          },
        });
      }

      req.webhookAuth = {
        apiKeyId: apiKeyRow.id,
        orgId: apiKeyRow.org_id,
        scopes: apiKeyRow.scopes,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  TIMESTAMP_TOLERANCE_SECONDS,
  isFreshTimestamp,
  computeSignature,
  signaturesMatch,
  findActiveApiKey,
  createWebhookAuth,
};