const express = require("express");
const { createWebhookAuth } = require("../middleware/webhookAuth");
const {
  createTokenBucketRateLimiter,
} = require("../middleware/rateLimit");
const {
  webhookIncidentSchema,
} = require("../schemas/webhookIncident");
const {
  ingestIncident,
} = require("../services/incidentIngestionService");

const router = express.Router();

const webhookRateLimiter = createTokenBucketRateLimiter({
  keyGenerator: (req) => req.get("X-API-Key"),
  capacity: Number(process.env.WEBHOOK_RATE_LIMIT_CAPACITY || 10),
  refillRatePerSecond: Number(
    process.env.WEBHOOK_RATE_LIMIT_REFILL_RATE || 1
  ),
});

const webhookAuth = createWebhookAuth({
  secretResolver: async (_apiKeyRow, _req) => {
    return process.env.PULSEGRID_WEBHOOK_SECRET;
  },
});

router.post(
  "/incidents",
  webhookRateLimiter,
  webhookAuth,
  async (req, res, next) => {
    const result = webhookIncidentSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        data: null,
        error: {
          code: "INVALID_WEBHOOK_PAYLOAD",
          message: "Invalid webhook payload.",
          details: result.error.flatten(),
        },
      });
    }

    try {
      const resultData = await ingestIncident({
        orgId: req.webhookAuth.orgId,
        payload: result.data,
      });

      const statusCode =
        resultData.status === "merged" ? 202 : 202;

      return res.status(statusCode).json({
        data: resultData,
        error: null,
      });
    } catch (error) {
      if (error.code === "INVALID_SERVICE") {
        return res.status(400).json({
          data: null,
          error: {
            code: "INVALID_SERVICE",
            message: "Service does not belong to the authenticated organization.",
          },
        });
      }

      return next(error);
    }
  }
);

module.exports = router;