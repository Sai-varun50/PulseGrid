const express = require("express");
const cookieParser = require("cookie-parser");
const authRouter = require("./routes/auth");
const { authenticate } = require("./middleware/auth");
const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRouter);

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
app.get("/protected-test", authenticate, (req, res) => {
  res.status(200).json({
    data: {
      auth: req.auth,
    },
    error: null,
  });
});

module.exports = { app };