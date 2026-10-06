const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");

process.env.PULSEGRID_WEBHOOK_SECRET = "test-webhook-secret";

const db = require("../src/lib/db");
const redis = require("../src/lib/redis");

const {
  ingestIncident,
} = require("../src/services/incidentIngestionService");

const {
  createApiKey,
} = require("../src/services/apiKeyService");

const { app } = require("../src/index");

async function createFixture() {
  const [orgId] = await db("organizations").insert({
    name: `T10 Test Org ${Date.now()}`,
    plan_tier: "free",
  });

  const [teamId] = await db("teams").insert({
    org_id: orgId,
    name: "T10 Test Team",
  });

  const [serviceId] = await db("services").insert({
    team_id: teamId,
    name: "T10 Test Service",
  });

  return {
    orgId,
    teamId,
    serviceId,
  };
}

async function cleanupFixture({
  orgId,
  teamId,
  serviceId,
}) {
  await db("incident_events")
    .whereIn(
      "incident_id",
      db("incidents")
        .select("id")
        .where("service_id", serviceId)
    )
    .del();

  await db("incidents")
    .where("service_id", serviceId)
    .del();

  await db("incident_clusters")
    .where("team_id", teamId)
    .del();

  await db("services")
    .where("id", serviceId)
    .del();

  await db("teams")
    .where("id", teamId)
    .del();

  await db("organizations")
    .where("id", orgId)
    .del();
}

function createWebhookRequest(body, secret) {
  const rawBody = Buffer.from(JSON.stringify(body));

  const timestamp = String(
    Math.floor(Date.now() / 1000)
  );

  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return {
    rawBody,
    timestamp,
    signature,
  };
}

function startTestServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);

    server.listen(0, () => {
      const { port } = server.address();

      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
      });
    });
  });
}

async function postWebhook(url, body, headers) {
  const response = await fetch(`${url}/webhook/incidents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": headers.apiKey,
      "X-Signature": headers.signature,
      "X-Timestamp": headers.timestamp,
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("POST /webhook/incidents creates an incident", async () => {
  const fixture = await createFixture();

  const apiKey = await createApiKey({
    orgId: fixture.orgId,
    scopes: ["webhook:write"],
  });

  const { server, url } = await startTestServer();

  try {
    const payload = {
      service_id: fixture.serviceId,
      title: "Checkout API returning 5xx",
      description: "Error rate above threshold",
      severity: "high",
      fingerprint: `http-test-${Date.now()}`,
      event_id: `http-event-${Date.now()}`,
    };

    const webhook = createWebhookRequest(
      payload,
      "test-webhook-secret"
    );

    const response = await postWebhook(url, payload, {
      apiKey: apiKey.plaintext_key,
      signature: webhook.signature,
      timestamp: webhook.timestamp,
    });

    assert.equal(response.status, 202);
    assert.equal(response.body.error, null);
    assert.equal(response.body.data.status, "created");
    assert.ok(response.body.data.incident_id);
  } finally {
    await new Promise((resolve) => server.close(resolve));

    await db("api_keys")
      .where("id", apiKey.id)
      .del();

    await cleanupFixture(fixture);
  }
});

test("POST /webhook/incidents rejects invalid payload", async () => {
  const fixture = await createFixture();

  const apiKey = await createApiKey({
    orgId: fixture.orgId,
    scopes: ["webhook:write"],
  });

  const { server, url } = await startTestServer();

  try {
    const payload = {
      service_id: fixture.serviceId,
      title: "",
      severity: "invalid",
      fingerprint: "",
    };

    const webhook = createWebhookRequest(
      payload,
      "test-webhook-secret"
    );

    const response = await postWebhook(url, payload, {
      apiKey: apiKey.plaintext_key,
      signature: webhook.signature,
      timestamp: webhook.timestamp,
    });

    assert.equal(response.status, 400);

    assert.equal(
      response.body.error.code,
      "INVALID_WEBHOOK_PAYLOAD"
    );

    const incidents = await db("incidents")
      .where("service_id", fixture.serviceId);

    assert.equal(incidents.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));

    await db("api_keys")
      .where("id", apiKey.id)
      .del();

    await cleanupFixture(fixture);
  }
});

test("creates an incident and triggered event", async () => {
  const fixture = await createFixture();

  try {
    const result = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API returning 5xx",
        description: "Error rate above threshold",
        severity: "high",
        fingerprint: "checkout-api-5xx",
        event_id: "event-001",
      },
    });

    assert.equal(result.status, "created");
    assert.ok(result.incident_id);

    const incident = await db("incidents")
      .where("id", result.incident_id)
      .first();

    assert.equal(incident.service_id, fixture.serviceId);
    assert.equal(incident.title, "Checkout API returning 5xx");
    assert.equal(incident.severity, "high");
    assert.equal(incident.status, "triggered");
    assert.equal(incident.dedup_key, "checkout-api-5xx");

    const event = await db("incident_events")
      .where("incident_id", result.incident_id)
      .first();

    assert.equal(event.type, "triggered");
    assert.equal(event.actor_id, null);
  } finally {
    await cleanupFixture(fixture);
  }
});

/*
 * T14
 * Rule-based alert correlation:
 * three recent open incidents from the same team
 * should belong to one cluster.
 */
test("correlates three same-team incidents into one cluster", async () => {
  const fixture = await createFixture();

  try {
    const first = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API latency",
        description: "Latency above threshold",
        severity: "high",
        fingerprint: "checkout-latency",
        event_id: "correlation-event-001",
      },
    });

    const second = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API errors",
        description: "Error rate increased",
        severity: "high",
        fingerprint: "checkout-errors",
        event_id: "correlation-event-002",
      },
    });

    const third = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API connection failures",
        description: "Connection failures increased",
        severity: "critical",
        fingerprint: "checkout-connections",
        event_id: "correlation-event-003",
      },
    });

    assert.equal(first.status, "created");
    assert.equal(second.status, "created");
    assert.equal(third.status, "created");

    assert.ok(first.cluster_id);
    assert.equal(second.cluster_id, first.cluster_id);
    assert.equal(third.cluster_id, first.cluster_id);

    const incidents = await db("incidents")
      .where("service_id", fixture.serviceId)
      .orderBy("id");

    assert.equal(incidents.length, 3);

    assert.equal(incidents[0].cluster_id, first.cluster_id);
    assert.equal(incidents[1].cluster_id, first.cluster_id);
    assert.equal(incidents[2].cluster_id, first.cluster_id);

    const clusters = await db("incident_clusters")
      .where("team_id", fixture.teamId);

    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].id, first.cluster_id);
  } finally {
    await cleanupFixture(fixture);
  }
});

/*
 * T15 - Step 1
 * Incidents from different teams must not share a cluster.
 */
test("does not correlate incidents from different teams", async () => {
  const fixture = await createFixture();

  let otherTeamId;
  let otherServiceId;

  try {
    const [otherTeam] = await db("teams").insert({
      org_id: fixture.orgId,
      name: "T15 Other Team",
    });

    otherTeamId = otherTeam;

    const [otherService] = await db("services").insert({
      team_id: otherTeamId,
      name: "T15 Other Service",
    });

    otherServiceId = otherService;

    const first = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Team A database alert",
        severity: "high",
        fingerprint: "team-a-alert",
        event_id: "t15-event-001",
      },
    });

    const second = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: otherServiceId,
        title: "Team B database alert",
        severity: "high",
        fingerprint: "team-b-alert",
        event_id: "t15-event-002",
      },
    });

    assert.equal(first.status, "created");
    assert.equal(second.status, "created");

    assert.ok(first.cluster_id);
    assert.ok(second.cluster_id);

    assert.notEqual(second.cluster_id, first.cluster_id);

    const firstCluster = await db("incident_clusters")
      .where("id", first.cluster_id)
      .first();

    const secondCluster = await db("incident_clusters")
      .where("id", second.cluster_id)
      .first();

    assert.equal(firstCluster.team_id, fixture.teamId);
    assert.equal(secondCluster.team_id, otherTeamId);
  } finally {
    if (otherServiceId) {
      await db("incident_events")
        .whereIn(
          "incident_id",
          db("incidents")
            .select("id")
            .where("service_id", otherServiceId)
        )
        .del();

      await db("incidents")
        .where("service_id", otherServiceId)
        .del();

      await db("incident_clusters")
        .where("team_id", otherTeamId)
        .del();

      await db("services")
        .where("id", otherServiceId)
        .del();
    }

    if (otherTeamId) {
      await db("teams")
        .where("id", otherTeamId)
        .del();
    }

    await cleanupFixture(fixture);
  }
});

/*
 * T15 - Step 2
 * An incident outside the configured correlation window
 * must not join the previous incident's cluster.
 */
test("does not correlate incidents outside the correlation window", async () => {
  const fixture = await createFixture();

  try {
    const first = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Old database alert",
        severity: "high",
        fingerprint: "old-database-alert",
        event_id: "t15-window-001",
      },
    });

    assert.equal(first.status, "created");
    assert.ok(first.cluster_id);

    // Move the first incident outside the 5-minute
    // correlation window.
    await db("incidents")
      .where("id", first.incident_id)
      .update({
        created_at: db.raw(
          "DATE_SUB(NOW(), INTERVAL 6 MINUTE)"
        ),
      });

    const second = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "New database alert",
        severity: "high",
        fingerprint: "new-database-alert",
        event_id: "t15-window-002",
      },
    });

    assert.equal(second.status, "created");
    assert.ok(second.cluster_id);

    assert.notEqual(second.cluster_id, first.cluster_id);

    const clusters = await db("incident_clusters")
      .where("team_id", fixture.teamId)
      .orderBy("id");

    assert.equal(clusters.length, 2);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("merges into an existing open incident with the same fingerprint", async () => {
  const fixture = await createFixture();

  try {
    const first = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API returning 5xx",
        severity: "high",
        fingerprint: "checkout-api-5xx",
        event_id: "event-001",
      },
    });

    const second = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API still returning 5xx",
        severity: "critical",
        fingerprint: "checkout-api-5xx",
        event_id: "event-002",
      },
    });

    assert.equal(second.status, "merged");
    assert.equal(second.incident_id, first.incident_id);

    const incidents = await db("incidents")
      .where("service_id", fixture.serviceId);

    assert.equal(incidents.length, 1);

    const events = await db("incident_events")
      .where("incident_id", first.incident_id)
      .orderBy("id");

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "triggered");
    assert.equal(events[1].type, "dedup_merged");
  } finally {
    await cleanupFixture(fixture);
  }
});

test("rejects a service belonging to another organization", async () => {
  const fixture = await createFixture();

  try {
    const [otherOrgId] = await db("organizations").insert({
      name: `T10 Other Org ${Date.now()}`,
      plan_tier: "free",
    });

    try {
      await assert.rejects(
        ingestIncident({
          orgId: otherOrgId,
          payload: {
            service_id: fixture.serviceId,
            title: "Unauthorized incident",
            severity: "high",
            fingerprint: "unauthorized-service",
          },
        }),
        (error) => {
          assert.equal(error.code, "INVALID_SERVICE");
          return true;
        }
      );

      const incidents = await db("incidents")
        .where("service_id", fixture.serviceId);

      assert.equal(incidents.length, 0);
    } finally {
      await db("organizations")
        .where("id", otherOrgId)
        .del();
    }
  } finally {
    await cleanupFixture(fixture);
  }
});

test.after(async () => {
  await db.destroy();

  if (redis.isOpen) {
    await redis.quit();
  }
});

test("same fingerprint after resolution creates a new incident", async () => {
  const fixture = await createFixture();

  try {
    const first = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API failure",
        severity: "high",
        fingerprint: "checkout-api-5xx",
        event_id: "event-001",
      },
    });

    assert.equal(first.status, "created");

    await db("incidents")
      .where("id", first.incident_id)
      .update({
        status: "resolved",
      });

    const second = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API failure again",
        severity: "high",
        fingerprint: "checkout-api-5xx",
        event_id: "event-002",
      },
    });

    assert.equal(second.status, "created");
    assert.notEqual(second.incident_id, first.incident_id);

    const incidents = await db("incidents")
      .where("service_id", fixture.serviceId)
      .orderBy("id");

    assert.equal(incidents.length, 2);
    assert.equal(incidents[0].status, "resolved");
    assert.equal(incidents[1].status, "triggered");
  } finally {
    await cleanupFixture(fixture);
  }
});

test("concurrent identical alerts create only one incident", async () => {
  const fixture = await createFixture();

  try {
    const payload = {
      service_id: fixture.serviceId,
      title: "Checkout API returning 5xx",
      severity: "high",
      fingerprint: "concurrent-checkout-5xx",
    };

    const [first, second] = await Promise.all([
      ingestIncident({
        orgId: fixture.orgId,
        payload: {
          ...payload,
          event_id: "concurrent-event-001",
        },
      }),

      ingestIncident({
        orgId: fixture.orgId,
        payload: {
          ...payload,
          event_id: "concurrent-event-002",
        },
      }),
    ]);

    const incidents = await db("incidents")
      .where("service_id", fixture.serviceId)
      .where("dedup_key", payload.fingerprint);

    assert.equal(incidents.length, 1);

    const statuses = [first.status, second.status].sort();

    assert.deepEqual(statuses, ["created", "merged"]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("merged webhook records the incoming event_id", async () => {
  const fixture = await createFixture();

  try {
    const first = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API failure",
        severity: "high",
        fingerprint: "event-id-dedup-test",
        event_id: "event-original",
      },
    });

    const second = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "Checkout API failure again",
        severity: "critical",
        fingerprint: "event-id-dedup-test",
        event_id: "event-duplicate",
      },
    });

    assert.equal(second.status, "merged");

    const dedupEvent = await db("incident_events")
      .where("incident_id", first.incident_id)
      .where("type", "dedup_merged")
      .first();

    assert.ok(dedupEvent);
    assert.match(dedupEvent.note, /event-duplicate/);
  } finally {
    await cleanupFixture(fixture);
  }
});