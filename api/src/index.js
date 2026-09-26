const express = require("express");

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "pulsegrid-api"
  });
});

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`PulseGrid API listening on port ${port}`);
});
