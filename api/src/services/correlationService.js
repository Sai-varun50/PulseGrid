const DEFAULT_CORRELATION_WINDOW_MINUTES = 5;

function getCorrelationWindowMinutes() {
  const value = Number(
    process.env.CORRELATION_WINDOW_MINUTES ??
      DEFAULT_CORRELATION_WINDOW_MINUTES
  );

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_CORRELATION_WINDOW_MINUTES;
  }

  return value;
}

/**
 * Correlates an incident with other recent open incidents
 * belonging to the same team.
 *
 * Rules:
 * - Same team
 * - Existing incident must be open
 *   (triggered or acknowledged)
 * - Existing incident must fall inside the rolling window
 * - No ML or similarity scoring is used
 *
 * This function expects to run inside an existing Knex transaction.
 */
async function correlateIncident(trx, incidentId) {
  const windowMinutes = getCorrelationWindowMinutes();

  const incident = await trx("incidents")
    .join("services", "incidents.service_id", "services.id")
    .select(
      "incidents.id",
      "incidents.service_id",
      "incidents.cluster_id",
      "incidents.created_at",
      "services.team_id"
    )
    .where("incidents.id", incidentId)
    .first();

  if (!incident) {
    const error = new Error("Incident not found.");
    error.code = "INCIDENT_NOT_FOUND";
    throw error;
  }

  // Find recent open incidents belonging to the same team.
  const recentIncidents = await trx("incidents")
    .join("services", "incidents.service_id", "services.id")
    .select(
      "incidents.id",
      "incidents.cluster_id",
      "incidents.created_at"
    )
    .where("services.team_id", incident.team_id)
    .whereIn("incidents.status", ["triggered", "acknowledged"])
    .where("incidents.id", "!=", incident.id)
    .where(
      "incidents.created_at",
      ">=",
      trx.raw("DATE_SUB(?, INTERVAL ? MINUTE)", [
        incident.created_at,
        windowMinutes,
      ])
    )
    .orderBy("incidents.created_at", "desc");

  if (recentIncidents.length === 0) {
    const [clusterId] = await trx("incident_clusters").insert({
      team_id: incident.team_id,
    });

    await trx("incidents")
      .where("id", incident.id)
      .update({
        cluster_id: clusterId,
      });

    return {
      cluster_id: clusterId,
      status: "new_cluster",
      correlated_incident_ids: [],
    };
  }

  // Prefer the cluster belonging to the most recent related incident.
  const existingClusterIncident = recentIncidents.find(
    (relatedIncident) => relatedIncident.cluster_id !== null
  );

  let clusterId;

  if (existingClusterIncident) {
    clusterId = existingClusterIncident.cluster_id;
  } else {
    // Recent related incidents exist, but none has a cluster yet.
    const [newClusterId] = await trx("incident_clusters").insert({
      team_id: incident.team_id,
    });

    clusterId = newClusterId;
  }

  // Attach all recent same-team open incidents that are currently
  // unclustered, plus the new incident, to the selected cluster.
  const incidentIdsToAttach = recentIncidents
    .filter((relatedIncident) => relatedIncident.cluster_id === null)
    .map((relatedIncident) => relatedIncident.id);

  incidentIdsToAttach.push(incident.id);

  await trx("incidents")
    .whereIn("id", incidentIdsToAttach)
    .update({
      cluster_id: clusterId,
    });

  return {
    cluster_id: clusterId,
    status: "correlated",
    correlated_incident_ids: incidentIdsToAttach.filter(
      (id) => id !== incident.id
    ),
  };
}

module.exports = {
  correlateIncident,
};