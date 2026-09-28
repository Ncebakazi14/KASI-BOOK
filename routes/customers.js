const express = require("express");
const bcrypt = require("bcryptjs");
const { db, newId } = require("../db");

const router = express.Router();

function publicCustomer(row) {
  return { id: row.id, name: row.name, phone: row.phone, createdAt: row.created_at };
}

/* POST /api/customers/register */
router.post("/register", async (req, res) => {
  const { name, phone, password } = req.body || {};
  if (!name || !String(name).trim() || !phone || !String(phone).trim() || !password) {
    return res.status(400).json({ error: "Please fill in every field." });
  }

  const existing = await db.prepare("SELECT id FROM customers WHERE phone = ?").get(String(phone).trim());
  if (existing) {
    return res.status(409).json({ error: "That number is already registered — try logging in." });
  }

  const id = newId("c");
  const passwordHash = bcrypt.hashSync(String(password), 10);
  const createdAt = new Date().toISOString();

  await db.prepare(`INSERT INTO customers (id, name, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, String(name).trim(), String(phone).trim(), passwordHash, createdAt);

  const row = await db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
  res.status(201).json(publicCustomer(row));
});

/* POST /api/customers/login */
router.post("/login", async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ error: "Please enter your number and password." });
  }

  const row = await db.prepare("SELECT * FROM customers WHERE phone = ?").get(String(phone).trim());
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: "No account with that number and password." });
  }

  res.json(publicCustomer(row));
});

module.exports = router;
