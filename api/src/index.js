const express = require("express");
const cookieParser = require("cookie-parser");
const webhookRouter = require("./routes/webhook");
const authRouter = require("./routes/auth");
const apiKeysRouter = require("./routes/apiKeys");
const incidentsRouter = require("./routes/incidents");


const app = express();

app.use(express.json({
  verify: (req, _res, buffer) => {
    if (req.path === "/webhook/incidents") {
      req.rawBody = Buffer.from(buffer);
    }
  },
}));
app.use(cookieParser());
app.use("/webhook", webhookRouter);
app.use("/auth", authRouter);
app.use("/api-keys", apiKeysRouter);
app.use("/incidents", incidentsRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "pulsegrid-api",
  });
});

const port = Number(process.env.PORT || 3000);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`PulseGrid API listening on port ${port}`);
  });
}

module.exports = { app };