const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// SQLite (WAL mode) keeps recent writes in crm.db-wal until a checkpoint merges
// them into crm.db itself. Run this on the SOURCE server before copying/uploading
// crm.db, otherwise the copy can be missing everything not yet checkpointed.
router.post("/checkpoint", requireAuth, requireAdmin, (req, res) => {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  res.json({ ok: true, note: "WAL flushed into the main db file." });
});

// One-time data migration helper: lets an admin upload a local crm.db file to
// replace the one on this deployment. Remove this route once migration is done.
router.post(
  "/import-db",
  requireAuth,
  requireAdmin,
  express.raw({ type: "*/*", limit: "100mb" }),
  (req, res) => {
    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: "No file data received" });
    }

    const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || "./data/crm.db");

    // Clear any existing WAL/SHM files *before* writing the new main file. If one
    // survives alongside the replaced file, SQLite's crash-recovery can replay its
    // stale frames over the new data on next boot and silently wipe it out — so a
    // failure to remove them aborts the import instead of proceeding unsafely.
    const failures = [];
    for (const ext of ["-wal", "-shm"]) {
      try {
        fs.unlinkSync(dbPath + ext);
      } catch (err) {
        if (err.code !== "ENOENT") failures.push({ file: dbPath + ext, error: err.message });
      }
    }
    if (failures.length) {
      return res.status(500).json({
        error: "Could not clear existing WAL/journal files — import aborted for safety.",
        failures,
      });
    }

    fs.writeFileSync(dbPath, req.body);

    res.json({
      ok: true,
      bytesWritten: req.body.length,
      note: "Now restart the service in Railway for this to take effect.",
    });
  }
);

module.exports = router;
