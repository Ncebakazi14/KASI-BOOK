const express = require("express");
const bcrypt = require("bcryptjs");
const { db, newId } = require("../db");

const router = express.Router();

async function servicesFor(businessId) {
  return db.prepare("SELECT id, name, price, duration, image FROM services WHERE business_id = ?").all(businessId);
}

async function publicBusiness(row, includeServices = true) {
  const out = {
    id: row.id,
    name: row.name,
    category: row.category,
    owner: row.owner,
    location: row.location,
    tagline: row.tagline,
    icon: row.icon,
    hue: row.hue,
    photo: row.photo || null
  };
  if (includeServices) out.services = await servicesFor(row.id);
  return out;
}

/* GET /api/businesses  — list all (for browse grid + merchant login dropdown) */
router.get("/", async (req, res) => {
  const rows = await db.prepare("SELECT * FROM businesses ORDER BY name ASC").all();
  res.json(await Promise.all(rows.map(row => publicBusiness(row))));
});

/* GET /api/businesses/:id */
router.get("/:id", async (req, res) => {
  const row = await db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Business not found." });
  res.json(await publicBusiness(row));
});

/* POST /api/businesses/register */
router.post("/register", async (req, res) => {
  const { name, category, owner, location, password } = req.body || {};
  if (![name, category, owner, location, password].every(v => v && String(v).trim())) {
    return res.status(400).json({ error: "Please fill in every field." });
  }

  const existing = await db.prepare("SELECT id FROM businesses WHERE lower(name) = lower(?)").get(String(name).trim());
  if (existing) {
    return res.status(409).json({ error: "A business with that name already exists." });
  }

  const id = newId("b");
  const passwordHash = bcrypt.hashSync(String(password), 10);
  await db.prepare(`INSERT INTO businesses (id, name, category, owner, password_hash, location, tagline, icon, hue, photo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`)
    .run(id, String(name).trim(), String(category).trim(), String(owner).trim(), passwordHash,
      String(location).trim(), "New on KasiBook — set your tagline in Business profile.", "🏪", "green",
      new Date().toISOString());

  const row = await db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
  res.status(201).json(await publicBusiness(row));
});

/* POST /api/businesses/login  { businessId, password } */
router.post("/login", async (req, res) => {
  const { businessId, password } = req.body || {};
  if (!businessId || !password) {
    return res.status(400).json({ error: "Please choose your business and enter a password." });
  }
  const row = await db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: "Incorrect password. Try again." });
  }
  res.json(await publicBusiness(row));
});

/* PATCH /api/businesses/:id  — update profile (name, tagline, location, photo) */
router.patch("/:id", async (req, res) => {
  const row = await db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Business not found." });

  const { name, tagline, location, photo } = req.body || {};
  const updated = {
    name: (name && String(name).trim()) || row.name,
    tagline: tagline !== undefined ? String(tagline) : row.tagline,
    location: (location && String(location).trim()) || row.location,
    photo: photo !== undefined ? photo : row.photo
  };

  await db.prepare("UPDATE businesses SET name = ?, tagline = ?, location = ?, photo = ? WHERE id = ?")
    .run(updated.name, updated.tagline, updated.location, updated.photo, row.id);

  const fresh = await db.prepare("SELECT * FROM businesses WHERE id = ?").get(row.id);
  res.json(await publicBusiness(fresh));
});

/* ---------- Services ---------- */

/* POST /api/businesses/:id/services  { name, price, duration, image? } */
router.post("/:id/services", async (req, res) => {
  const biz = await db.prepare("SELECT id FROM businesses WHERE id = ?").get(req.params.id);
  if (!biz) return res.status(404).json({ error: "Business not found." });

  const { name, price, duration, image } = req.body || {};
  const priceNum = parseFloat(price);
  const durationNum = parseInt(duration, 10);
  if (!name || !String(name).trim() || Number.isNaN(priceNum) || Number.isNaN(durationNum)) {
    return res.status(400).json({ error: "Please fill in the service name, price and duration." });
  }

  const id = newId("s");
  await db.prepare("INSERT INTO services (id, business_id, name, price, duration, image) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, biz.id, String(name).trim(), priceNum, durationNum, image || null);

  res.status(201).json(await db.prepare("SELECT id, name, price, duration, image FROM services WHERE id = ?").get(id));
});

/* PATCH /api/businesses/:id/services/:serviceId  { image } — set or clear a service photo */
router.patch("/:id/services/:serviceId", async (req, res) => {
  const svc = await db.prepare("SELECT * FROM services WHERE id = ? AND business_id = ?").get(req.params.serviceId, req.params.id);
  if (!svc) return res.status(404).json({ error: "Service not found." });

  const { image } = req.body || {};
  await db.prepare("UPDATE services SET image = ? WHERE id = ?").run(image === undefined ? svc.image : image, svc.id);
  res.json(await db.prepare("SELECT id, name, price, duration, image FROM services WHERE id = ?").get(svc.id));
});

/* DELETE /api/businesses/:id/services/:serviceId */
router.delete("/:id/services/:serviceId", async (req, res) => {
  const svc = await db.prepare("SELECT * FROM services WHERE id = ? AND business_id = ?").get(req.params.serviceId, req.params.id);
  if (!svc) return res.status(404).json({ error: "Service not found." });
  await db.prepare("DELETE FROM services WHERE id = ?").run(svc.id);
  res.status(204).end();
});

module.exports = router;
