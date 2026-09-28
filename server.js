require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { init } = require("./db");
const customersRouter = require("./routes/customers");
const businessesRouter = require("./routes/businesses");
const bookingsRouter = require("./routes/bookings");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Higher limit than the default so base64 photo uploads (capped at ~2MB client-side) fit.
app.use(express.json({ limit: "6mb" }));

app.use("/api/customers", customersRouter);
app.use("/api/businesses", businessesRouter);
app.use("/api/bookings", bookingsRouter);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Serve the frontend when running locally. (On Vercel this line is ignored:
// Vercel serves everything in /public itself, straight from its CDN.)
app.use(express.static(path.join(__dirname, "public")));

// Fallback error handler for anything that throws in a route
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

if (!process.env.VERCEL) {
  // Running locally (npm start): create tables if needed, seed demo data,
  // then start listening.
  init()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`KasiBook running at http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Failed to connect to the database:", err);
      process.exit(1);
    });
}
// On Vercel there's no "startup" and no app.listen(): Vercel imports the app
// below and runs it per request. The Supabase tables already exist, so we
// skip init() there.

module.exports = app;