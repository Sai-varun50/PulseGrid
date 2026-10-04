const express = require("express");
const db = require("../lib/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/authorize");

const router = express.Router();

router.post(
  "/:id/ack",
  authenticate,
  requireRole("responder", "admin"),
  async (req, res, next) => {
    const incidentId = Number(req.params.id);

    if (!Number.isInteger(incidentId)) {
      return res.status(400).json({
        data: null,
        error: {
          code: "INVALID_INCIDENT_ID",
          message: "Invalid incident ID.",
        },
      });
    }

    try {
      const updated = await db("incidents")
        .join("services", "incidents.service_id", "services.id")
        .join("teams", "services.team_id", "teams.id")
        .where("incidents.id", incidentId)
        .andWhere("teams.org_id", req.auth.org_id)
        .andWhere("incidents.status", "triggered")
        .update({
          "incidents.status": "acknowledged",
          "incidents.updated_at": db.fn.now(),
        });

      if (updated === 0) {
        const incident = await db("incidents")
          .join("services", "incidents.service_id", "services.id")
          .join("teams", "services.team_id", "teams.id")
          .select(
            "incidents.id",
            "incidents.status"
          )
          .where("incidents.id", incidentId)
          .andWhere("teams.org_id", req.auth.org_id)
          .first();

        if (!incident) {
          return res.status(404).json({
            data: null,
            error: {
              code: "NOT_FOUND",
              message: "Incident not found.",
            },
          });
        }

        return res.status(409).json({
          data: null,
          error: {
            code: "ALREADY_HANDLED",
            message: "Incident already acknowledged or resolved.",
          },
        });
      }

      await db("incident_events").insert({
        incident_id: incidentId,
        type: "acknowledged",
        actor_id: req.auth.user_id,
        note: null,
      });

      const incident = await db("incidents")
        .where("id", incidentId)
        .first();

      return res.status(200).json({
        data: incident,
        error: null,
      });
    } catch (error) {
      return next(error);
    }
  }
);
router.post(
  "/:id/resolve",
  authenticate,
  requireRole("responder", "admin"),
  async (req, res, next) => {
    const incidentId = Number(req.params.id);

    if (!Number.isInteger(incidentId)) {
      return res.status(400).json({
        data: null,
        error: {
          code: "INVALID_INCIDENT_ID",
          message: "Invalid incident ID.",
        },
      });
    }

    try {
      const updated = await db("incidents")
        .join("services", "incidents.service_id", "services.id")
        .join("teams", "services.team_id", "teams.id")
        .where("incidents.id", incidentId)
        .andWhere("teams.org_id", req.auth.org_id)
        .whereIn("incidents.status", ["triggered", "acknowledged"])
        .update({
          "incidents.status": "resolved",
          "incidents.resolved_at": db.fn.now(),
          "incidents.updated_at": db.fn.now(),
        });

      if (updated === 0) {
        const incident = await db("incidents")
          .join("services", "incidents.service_id", "services.id")
          .join("teams", "services.team_id", "teams.id")
          .select(
            "incidents.id",
            "incidents.status"
          )
          .where("incidents.id", incidentId)
          .andWhere("teams.org_id", req.auth.org_id)
          .first();

        if (!incident) {
          return res.status(404).json({
            data: null,
            error: {
              code: "NOT_FOUND",
              message: "Incident not found.",
            },
          });
        }

        return res.status(409).json({
          data: null,
          error: {
            code: "ALREADY_HANDLED",
            message: "Incident already resolved.",
          },
        });
      }

      await db("incident_events").insert({
        incident_id: incidentId,
        type: "resolved",
        actor_id: req.auth.user_id,
        note: null,
      });

      const incident = await db("incidents")
        .where("id", incidentId)
        .first();

      return res.status(200).json({
        data: incident,
        error: null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;