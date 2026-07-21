require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

require("./db"); // ensures schema + admin seed run before routes load

const authRoutes = require("./routes/auth.routes");
const leadsRoutes = require("./routes/leads.routes");
const followupsRoutes = require("./routes/followups.routes");
const callsRoutes = require("./routes/calls.routes");
const remarksRoutes = require("./routes/remarks.routes");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/leads/:leadId/followups", followupsRoutes);
app.use("/api/leads/:leadId/calls", callsRoutes);
app.use("/api/leads/:leadId/remarks", remarksRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Serve the built client (crm/client/dist) as one deployable service, if present.
// In local dev the client runs separately via Vite, so this directory won't exist.
const clientDistPath = path.join(__dirname, "../../client/dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`CRM API listening on http://localhost:${PORT}`));
