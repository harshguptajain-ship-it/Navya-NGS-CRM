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

module.exports = router;
