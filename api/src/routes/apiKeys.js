const express = require("express");
const { z } = require("zod");

const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/authorize");
const {
  createApiKey,
  revokeApiKey,
} = require("../services/apiKeyService");

const router = express.Router();

const createApiKeySchema = z.object({
  scopes: z.unknown(),
});

router.post(
  "/",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const validation = createApiKeySchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data.",
        },
      });
    }

    try {
      const result = await createApiKey({
        orgId: req.auth.org_id,
        scopes: validation.data.scopes,
      });

      return res.status(201).json({
        data: result,
        error: null,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error.",
        },
      });
    }
  }
);

router.delete(
  "/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid API key id.",
        },
      });
    }

    try {
      await revokeApiKey({
        orgId: req.auth.org_id,
        id,
      });

      return res.status(200).json({
        data: null,
        error: null,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error.",
        },
      });
    }
  }
);

module.exports = router;