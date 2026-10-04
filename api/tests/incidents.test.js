const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/lib/db");
const { app } = require("../src/index");
const {
  ingestIncident,
} = require("../src/services/incidentIngestionService");
const { createAccessToken } = require("../src/services/authService");

async function createFixture() {
  const [orgId] = await db("organizations").insert({
    name: `T11 Test Org ${Date.now()}`,
    plan_tier: "free",
  });

  const [teamId] = await db("teams").insert({
    org_id: orgId,
    name: "T11 Test Team",
  });

  const [serviceId] = await db("services").insert({
    team_id: teamId,
    name: "T11 Test Service",
  });

  const passwordHash = "test-password-hash";

  const [userId] = await db("users").insert({
    org_id: orgId,
    team_id: teamId,
    name: "T11 Responder",
    email: `t11-${Date.now()}@example.com`,
    password_hash: passwordHash,
    role: "responder",
    phone: null,
  });

  const user = {
    id: userId,
    org_id: orgId,
    role: "responder",
  };

  return {
    orgId,
    teamId,
    serviceId,
    userId,
    accessToken: createAccessToken(user),
  };
}

async function cleanupFixture({
  orgId,
  teamId,
  serviceId,
  userId,
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

  await db("users")
    .where("id", userId)
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

test("POST /incidents/:id/ack changes triggered to acknowledged", async () => {
  const fixture = await createFixture();

  try {
    const created = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "T11 ACK test",
        severity: "high",
        fingerprint: `t11-ack-${Date.now()}`,
      },
    });

    const server = app.listen(0);

    try {
      const { port } = server.address();

      const response = await fetch(
        `http://127.0.0.1:${port}/incidents/${created.incident_id}/ack`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fixture.accessToken}`,
          },
        }
      );

      assert.equal(response.status, 200);

      const incident = await db("incidents")
        .where("id", created.incident_id)
        .first();

      assert.equal(incident.status, "acknowledged");

      const event = await db("incident_events")
        .where("incident_id", created.incident_id)
        .where("type", "acknowledged")
        .first();

      assert.ok(event);
      assert.equal(event.actor_id, fixture.userId);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await cleanupFixture(fixture);
  }
});

test("POST /incidents/:id/resolve changes acknowledged to resolved", async () => {
  const fixture = await createFixture();

  try {
    const created = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "T11 RESOLVE test",
        severity: "high",
        fingerprint: `t11-resolve-${Date.now()}`,
      },
    });

    const server = app.listen(0);

    try {
      const { port } = server.address();

      // First acknowledge the incident
      const ackResponse = await fetch(
        `http://127.0.0.1:${port}/incidents/${created.incident_id}/ack`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fixture.accessToken}`,
          },
        }
      );

      assert.equal(ackResponse.status, 200);

      // Then resolve the incident
      const resolveResponse = await fetch(
        `http://127.0.0.1:${port}/incidents/${created.incident_id}/resolve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fixture.accessToken}`,
          },
        }
      );

      assert.equal(resolveResponse.status, 200);

      const incident = await db("incidents")
        .where("id", created.incident_id)
        .first();

      assert.equal(incident.status, "resolved");
      assert.ok(incident.resolved_at);

      const event = await db("incident_events")
        .where("incident_id", created.incident_id)
        .where("type", "resolved")
        .first();

      assert.ok(event);
      assert.equal(event.actor_id, fixture.userId);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await cleanupFixture(fixture);
  }
});
test("POST /incidents/:id/ack returns 409 when incident is already acknowledged", async () => {
  const fixture = await createFixture();

  try {
    const created = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "T11 duplicate ACK test",
        severity: "high",
        fingerprint: `t11-double-ack-${Date.now()}`,
      },
    });

    const server = app.listen(0);

    try {
      const { port } = server.address();

      const headers = {
        Authorization: `Bearer ${fixture.accessToken}`,
      };

      // First ACK
      const firstResponse = await fetch(
        `http://127.0.0.1:${port}/incidents/${created.incident_id}/ack`,
        {
          method: "POST",
          headers,
        }
      );

      assert.equal(firstResponse.status, 200);

      // Second ACK
      const secondResponse = await fetch(
        `http://127.0.0.1:${port}/incidents/${created.incident_id}/ack`,
        {
          method: "POST",
          headers,
        }
      );

      assert.equal(secondResponse.status, 409);

      const body = await secondResponse.json();

      assert.equal(body.error.code, "ALREADY_HANDLED");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await cleanupFixture(fixture);
  }
});
test("POST /incidents/:id/ack returns 403 for viewer", async () => {
  const fixture = await createFixture();

  try {
    const created = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "T11 viewer permission test",
        severity: "high",
        fingerprint: `t11-viewer-${Date.now()}`,
      },
    });

    const viewerUser = {
      id: fixture.userId,
      org_id: fixture.orgId,
      role: "viewer",
    };

    const viewerToken = createAccessToken(viewerUser);

    const server = app.listen(0);

    try {
      const { port } = server.address();

      const response = await fetch(
        `http://127.0.0.1:${port}/incidents/${created.incident_id}/ack`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${viewerToken}`,
          },
        }
      );

      assert.equal(response.status, 403);

      const body = await response.json();

      assert.equal(body.error.code, "FORBIDDEN");

      // Make sure the incident was NOT changed
      const incident = await db("incidents")
        .where("id", created.incident_id)
        .first();

      assert.equal(incident.status, "triggered");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await cleanupFixture(fixture);
  }
});
test("POST /incidents/:id/ack returns 404 for another organization", async () => {
  const fixtureA = await createFixture();
  const fixtureB = await createFixture();

  try {
    const created = await ingestIncident({
      orgId: fixtureA.orgId,
      payload: {
        service_id: fixtureA.serviceId,
        title: "T11 cross-org test",
        severity: "high",
        fingerprint: `t11-cross-org-${Date.now()}`,
      },
    });

    const server = app.listen(0);

    try {
      const { port } = server.address();

      const response = await fetch(
        `http://127.0.0.1:${port}/incidents/${created.incident_id}/ack`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fixtureB.accessToken}`,
          },
        }
      );

      assert.equal(response.status, 404);

      const body = await response.json();

      assert.equal(body.error.code, "NOT_FOUND");

      const incident = await db("incidents")
        .where("id", created.incident_id)
        .first();

      assert.equal(incident.status, "triggered");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await cleanupFixture(fixtureA);
    await cleanupFixture(fixtureB);
  }
});
test("concurrent ACK requests allow only one successful transition", async () => {
  const fixture = await createFixture();

  try {
    const created = await ingestIncident({
      orgId: fixture.orgId,
      payload: {
        service_id: fixture.serviceId,
        title: "T11 concurrency test",
        severity: "high",
        fingerprint: `t11-concurrency-${Date.now()}`,
      },
    });

    const server = app.listen(0);

    try {
      const { port } = server.address();

      const request = () =>
        fetch(
          `http://127.0.0.1:${port}/incidents/${created.incident_id}/ack`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${fixture.accessToken}`,
            },
          }
        );

      const [responseA, responseB] = await Promise.all([
        request(),
        request(),
      ]);

      const statuses = [
        responseA.status,
        responseB.status,
      ].sort();

      assert.deepEqual(statuses, [200, 409]);

      const incident = await db("incidents")
        .where("id", created.incident_id)
        .first();

      assert.equal(incident.status, "acknowledged");

      const acknowledgedEvents = await db("incident_events")
        .where("incident_id", created.incident_id)
        .where("type", "acknowledged");

      assert.equal(acknowledgedEvents.length, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await cleanupFixture(fixture);
  }
});
test.after(async () => {
  await db.destroy();
});