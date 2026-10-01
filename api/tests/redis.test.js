const test = require("node:test");
const assert = require("node:assert/strict");

const redis = require("../src/lib/redis");

test("Redis client can connect", async () => {
  assert.equal(redis.isOpen, false);

  await redis.connect();

  assert.equal(redis.isReady, true);

  await redis.quit();
});