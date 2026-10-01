const test = require("node:test");
const assert = require("node:assert/strict");

const redis = require("../src/lib/redis");
const {
  createTokenBucketRateLimiter,
} = require("../src/middleware/rateLimit");

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },

    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

test("rate limiter allows requests while tokens are available", async () => {
  if (!redis.isReady) {
    await redis.connect();
  }

  const key = "test-allow";
  await redis.del(`pulsegrid:rate-limit:${key}`);

  const limiter = createTokenBucketRateLimiter({
    keyGenerator: () => key,
    capacity: 2,
    refillRatePerSecond: 1,
  });

  const req = {};
  const res = createMockResponse();

  let calledNext = false;

  await limiter(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.statusCode, 200);

  await redis.del(`pulsegrid:rate-limit:${key}`);
});

test("rate limiter returns 429 when bucket is empty", async () => {
  if (!redis.isReady) {
    await redis.connect();
  }

  const key = "test-limit";
  const redisKey = `pulsegrid:rate-limit:${key}`;

  await redis
    .multi()
    .hSet(redisKey, {
      tokens: "0",
      timestamp: String(Date.now()),
    })
    .expire(redisKey, 60)
    .exec();

  const limiter = createTokenBucketRateLimiter({
    keyGenerator: () => key,
    capacity: 1,
    refillRatePerSecond: 1,
  });

  const req = {};
  const res = createMockResponse();

  let calledNext = false;

  await limiter(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error.code, "RATE_LIMITED");
  assert.ok(res.headers["Retry-After"]);

  await redis.del(redisKey);
});

test("rate limiter rejects missing key", async () => {
  if (!redis.isReady) {
    await redis.connect();
  }

  const limiter = createTokenBucketRateLimiter({
    keyGenerator: () => null,
    capacity: 2,
    refillRatePerSecond: 1,
  });

  const req = {};
  const res = createMockResponse();

  let calledNext = false;

  await limiter(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, "RATE_LIMIT_KEY_MISSING");
});
test.after(async () => {
  if (redis.isOpen) {
    await redis.quit();
  }
});