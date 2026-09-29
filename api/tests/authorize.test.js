const test = require("node:test");
const assert = require("node:assert");

const express = require("express");
const { requireRole } = require("../src/middleware/authorize");

function createTestApp(role) {
  const app = express();

  app.use((req, _res, next) => {
    req.auth = {
      user_id: 1,
      org_id: 1,
      role,
    };

    next();
  });

  app.get(
    "/admin-only",
    requireRole("admin"),
    (req, res) => {
      res.status(200).json({
        data: {
          message: "admin access granted",
        },
        error: null,
      });
    }
  );

  return app;
}

test("admin role is allowed", async () => {
  const app = createTestApp("admin");
  const server = app.listen(0);

  try {
    const { port } = server.address();

    const response = await fetch(
      `http://localhost:${port}/admin-only`
    );

    assert.strictEqual(response.status, 200);

    const body = await response.json();

    assert.deepStrictEqual(body, {
      data: {
        message: "admin access granted",
      },
      error: null,
    });
  } finally {
    server.close();
  }
});

test("responder role is forbidden from admin route", async () => {
  const app = createTestApp("responder");
  const server = app.listen(0);

  try {
    const { port } = server.address();

    const response = await fetch(
      `http://localhost:${port}/admin-only`
    );

    assert.strictEqual(response.status, 403);

    const body = await response.json();

    assert.deepStrictEqual(body, {
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action",
      },
    });
  } finally {
    server.close();
  }
});

test("viewer role is forbidden from admin route", async () => {
  const app = createTestApp("viewer");
  const server = app.listen(0);

  try {
    const { port } = server.address();

    const response = await fetch(
      `http://localhost:${port}/admin-only`
    );

    assert.strictEqual(response.status, 403);

    const body = await response.json();

    assert.deepStrictEqual(body, {
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action",
      },
    });
  } finally {
    server.close();
  }
});

test("missing authentication is rejected", async () => {
  const app = express();

  app.get(
    "/admin-only",
    requireRole("admin"),
    (_req, res) => {
      res.status(200).json({
        data: {
          message: "admin access granted",
        },
        error: null,
      });
    }
  );

  const server = app.listen(0);

  try {
    const { port } = server.address();

    const response = await fetch(
      `http://localhost:${port}/admin-only`
    );

    assert.strictEqual(response.status, 401);

    const body = await response.json();

    assert.deepStrictEqual(body, {
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required",
      },
    });
  } finally {
    server.close();
  }
});