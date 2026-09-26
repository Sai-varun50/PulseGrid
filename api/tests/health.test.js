const test = require("node:test");
const assert = require("node:assert");
const { app } = require("../src");

test("GET /health returns API health status", async () => {
  const server = app.listen(0);

  try {
    const { port } = server.address();

    const response = await fetch(`http://localhost:${port}/health`);

    assert.strictEqual(response.status, 200);

    const body = await response.json();

    assert.deepStrictEqual(body, {
      status: "ok",
      service: "pulsegrid-api",
    });
  } finally {
    server.close();
  }
});