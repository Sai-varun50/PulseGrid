const db = require("../lib/db");
const { correlateIncident } = require("./correlationService");

async function ingestIncident({ orgId, payload }) {
  return db.transaction(async (trx) => {
    const service = await trx("services")
      .join("teams", "services.team_id", "teams.id")
      .select("services.id")
      .where("services.id", payload.service_id)
      .andWhere("teams.org_id", orgId)
      .first();

    if (!service) {
      const error = new Error("Service does not belong to organization.");
      error.code = "INVALID_SERVICE";
      throw error;
    }

    const existingIncident = await trx("incidents")
      .select("id")
      .where({
        service_id: payload.service_id,
        dedup_key: payload.fingerprint,
      })
      .whereIn("status", ["triggered", "acknowledged"])
      .first();

    if (existingIncident) {
      await trx("incident_events").insert({
        incident_id: existingIncident.id,
        type: "dedup_merged",
        actor_id: null,
        note: payload.event_id
          ? `Webhook event ${payload.event_id} merged into existing incident.`
          : "Webhook event merged into existing incident.",
      });

      return {
        incident_id: existingIncident.id,
        status: "merged",
      };
    }

    let incidentId;

    try {
      [incidentId] = await trx("incidents").insert({
        service_id: payload.service_id,
        title: payload.title,
        description: payload.description ?? null,
        status: "triggered",
        severity: payload.severity,
        dedup_key: payload.fingerprint,
      });
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") {
        throw error;
      }

      const duplicateIncident = await trx("incidents")
        .select("id")
        .where({
          service_id: payload.service_id,
          dedup_key: payload.fingerprint,
        })
        .whereIn("status", ["triggered", "acknowledged"])
        .forUpdate()
        .first();

      if (!duplicateIncident) {
        throw error;
      }

      await trx("incident_events").insert({
        incident_id: duplicateIncident.id,
        type: "dedup_merged",
        actor_id: null,
        note: payload.event_id
          ? `Webhook event ${payload.event_id} merged into existing incident.`
          : "Webhook event merged into existing incident.",
      });

      return {
        incident_id: duplicateIncident.id,
        status: "merged",
      };
    }

    // T14: correlate the newly created incident with
    // recent open incidents from the same team.
    const correlationResult = await correlateIncident(trx, incidentId);

    await trx("incident_events").insert({
      incident_id: incidentId,
      type: "triggered",
      actor_id: null,
      note: payload.event_id
        ? `Incident created from webhook event ${payload.event_id}.`
        : "Incident created from webhook.",
    });

    return {
      incident_id: incidentId,
      status: "created",
      cluster_id: correlationResult.cluster_id,
    };
  });
}

module.exports = {
  ingestIncident,
};