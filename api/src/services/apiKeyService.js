const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../lib/db");

function generatePlaintextKey() {
  return crypto.randomBytes(32).toString("hex");
}

async function hashApiKey(plaintextKey) {
  return argon2.hash(plaintextKey);
}

async function verifyApiKey(keyHash, plaintextKey) {
  return argon2.verify(keyHash, plaintextKey);
}

async function createApiKey({ orgId, scopes }) {
  const plaintextKey = generatePlaintextKey();
  const keyHash = await hashApiKey(plaintextKey);

  const [id] = await db("api_keys").insert({
    org_id: orgId,
    key_hash: keyHash,
    scopes,
  });

  return {
    id,
    plaintext_key: plaintextKey,
    scopes,
  };
}

async function revokeApiKey({ orgId, id }) {
  return db("api_keys")
    .where({
      id,
      org_id: orgId,
    })
    .whereNull("revoked_at")
    .update({
      revoked_at: db.fn.now(),
    });
}

module.exports = {
  generatePlaintextKey,
  hashApiKey,
  verifyApiKey,
  createApiKey,
  revokeApiKey,
};