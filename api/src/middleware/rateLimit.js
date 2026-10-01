const redis = require("../lib/redis");

function createTokenBucketRateLimiter({
  keyGenerator,
  capacity,
  refillRatePerSecond,
}) {
  if (typeof keyGenerator !== "function") {
    throw new TypeError("keyGenerator must be a function");
  }

  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new TypeError("capacity must be a positive number");
  }

  if (!Number.isFinite(refillRatePerSecond) || refillRatePerSecond <= 0) {
    throw new TypeError("refillRatePerSecond must be a positive number");
  }

  return async function rateLimit(req, res, next) {
    try {
      if (!redis.isReady) {
        await redis.connect();
      }

      const key = keyGenerator(req);

      if (!key) {
        return res.status(400).json({
          data: null,
          error: {
            code: "RATE_LIMIT_KEY_MISSING",
            message: "Unable to determine rate-limit key.",
          },
        });
      }

      const now = Date.now();
      const redisKey = `pulsegrid:rate-limit:${key}`;

      const bucket = await redis.hGetAll(redisKey);

      const previousTokens = bucket.tokens
        ? Number(bucket.tokens)
        : capacity;

      const previousTimestamp = bucket.timestamp
        ? Number(bucket.timestamp)
        : now;

      const elapsedSeconds = Math.max(
        0,
        (now - previousTimestamp) / 1000
      );

      const refilledTokens = Math.min(
        capacity,
        previousTokens + elapsedSeconds * refillRatePerSecond
      );

      if (refilledTokens < 1) {
        const retryAfterSeconds = Math.ceil(
          (1 - refilledTokens) / refillRatePerSecond
        );

        res.set("Retry-After", String(retryAfterSeconds));

        return res.status(429).json({
          data: null,
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests.",
          },
        });
      }

      const remainingTokens = refilledTokens - 1;

      await redis
        .multi()
        .hSet(redisKey, {
          tokens: String(remainingTokens),
          timestamp: String(now),
        })
        .expire(redisKey, Math.ceil(capacity / refillRatePerSecond) * 2)
        .exec();

      res.set(
        "X-RateLimit-Limit",
        String(capacity)
      );

      res.set(
        "X-RateLimit-Remaining",
        String(Math.floor(remainingTokens))
      );

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  createTokenBucketRateLimiter,
};
