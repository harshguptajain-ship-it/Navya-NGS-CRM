const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Any logged-in user can list the team (needed to populate "assign to" pickers).
// Creating new accounts stays admin-only, handled below.
router.get("/users", requireAuth, (req, res) => {
  const users = db.prepare("SELECT id, name, email, role, created_at FROM users ORDER BY name").all();
  res.json({ users });
});

router.post("/users", requireAuth, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  const finalRole = role === "admin" ? "admin" : "executive";
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: "A user with this email already exists" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(name, email.toLowerCase(), hash, finalRole);

  res.status(201).json({
    user: { id: info.lastInsertRowid, name, email: email.toLowerCase(), role: finalRole },
  });
});

function adminCount(excludeId) {
  return excludeId
    ? db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND id != ?").get(excludeId).c
    : db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
}

// Edit an executive/admin: name, email, role, and optionally reset their password.
router.put("/users/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const { name, email, password, role } = req.body;
  const nextEmail = (email ?? existing.email).toLowerCase();
  const nextRole = role === "admin" || role === "executive" ? role : existing.role;

  if (nextEmail !== existing.email) {
    const dupe = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(nextEmail, req.params.id);
    if (dupe) return res.status(409).json({ error: "A user with this email already exists" });
  }

  // Don't allow demoting the last admin — there must always be someone who can manage the team.
  if (existing.role === "admin" && nextRole !== "admin" && adminCount(existing.id) === 0) {
    return res.status(400).json({ error: "Cannot demote the only remaining admin" });
  }

  const passwordHash = password && password.trim() ? bcrypt.hashSync(password.trim(), 10) : existing.password_hash;

  db.prepare(
    "UPDATE users SET name = ?, email = ?, role = ?, password_hash = ? WHERE id = ?"
  ).run(name ?? existing.name, nextEmail, nextRole, passwordHash, req.params.id);

  const user = db.prepare("SELECT id, name, email, role, created_at FROM users WHERE id = ?").get(req.params.id);
  res.json({ user });
});

router.delete("/users/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });

  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }
  if (existing.role === "admin" && adminCount(existing.id) === 0) {
    return res.status(400).json({ error: "Cannot delete the only remaining admin" });
  }

  // Leads/calls/followups/remarks/stage_history reference users without ON DELETE
  // CASCADE — check first so we can give a clear reason instead of a raw SQL error.
  const refCounts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM leads WHERE created_by = @id OR assigned_to = @id OR handling_by = @id) AS leads,
        (SELECT COUNT(*) FROM followups WHERE created_by = @id) AS followups,
        (SELECT COUNT(*) FROM calls WHERE executive_id = @id) AS calls,
        (SELECT COUNT(*) FROM remarks WHERE created_by = @id) AS remarks,
        (SELECT COUNT(*) FROM stage_history WHERE changed_by = @id) AS stage_history`
    )
    .get({ id: req.params.id });

  const totalRefs = Object.values(refCounts).reduce((a, b) => a + b, 0);
  if (totalRefs > 0) {
    return res.status(400).json({
      error: `Cannot delete: this user is linked to ${refCounts.leads} lead(s) and other activity (follow-ups, calls, remarks, or stage history). Reassign their leads to another executive first.`,
    });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
