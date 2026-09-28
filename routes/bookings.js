const express = require("express");
const crypto = require("crypto");
const { db, newId } = require("../db");

const router = express.Router();

function rowToBooking(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    serviceId: row.service_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    date: row.date,
    time: row.time,
    status: row.status,
    paid: !!row.paid,
    amountPaid: row.amount_paid,
    paymentRef: row.payment_ref,
    createdAt: row.created_at
  };
}

const SELECT_JOINED = `
  SELECT bk.*, c.name AS customer_name, c.phone AS customer_phone
  FROM bookings bk
  JOIN customers c ON c.id = bk.customer_id
`;

/* GET /api/bookings?customerId=  or  ?businessId= */
router.get("/", async (req, res) => {
  const { customerId, businessId } = req.query;
  let rows;
  if (customerId) {
    rows = await db.prepare(`${SELECT_JOINED} WHERE bk.customer_id = ? ORDER BY bk.date DESC, bk.time DESC`).all(customerId);
  } else if (businessId) {
    rows = await db.prepare(`${SELECT_JOINED} WHERE bk.business_id = ? ORDER BY bk.date ASC, bk.time ASC`).all(businessId);
  } else {
    rows = await db.prepare(`${SELECT_JOINED} ORDER BY bk.date DESC, bk.time DESC`).all();
  }
  res.json(rows.map(rowToBooking));
});

/* POST /api/bookings — create + mock-pay in one step (mirrors the demo payment flow) */
router.post("/", async (req, res) => {
  const { businessId, serviceId, customerId, date, time } = req.body || {};
  if (!businessId || !serviceId || !customerId || !date || !time) {
    return res.status(400).json({ error: "Missing booking details." });
  }

  const biz = await db.prepare("SELECT id FROM businesses WHERE id = ?").get(businessId);
  const service = await db.prepare("SELECT * FROM services WHERE id = ? AND business_id = ?").get(serviceId, businessId);
  const customer = await db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
  if (!biz || !service || !customer) {
    return res.status(404).json({ error: "Business, service or customer not found." });
  }

  const clash = await db.prepare(`
    SELECT id FROM bookings
    WHERE business_id = ? AND date = ? AND time = ? AND status NOT IN ('declined', 'cancelled')
  `).get(businessId, date, time);
  if (clash) {
    return res.status(409).json({ error: "That time slot has just been taken. Please pick another." });
  }

  const id = newId("bk");
  const paymentRef = "KB-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const createdAt = new Date().toISOString();

  await db.prepare(`INSERT INTO bookings
      (id, business_id, service_id, customer_id, date, time, status, paid, amount_paid, payment_ref, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed', 1, ?, ?, ?)`)
    .run(id, businessId, serviceId, customerId, date, time, service.price, paymentRef, createdAt);

  const row = await db.prepare(`${SELECT_JOINED} WHERE bk.id = ?`).get(id);
  res.status(201).json(rowToBooking(row));
});

/* PATCH /api/bookings/:id  { status: 'confirmed' | 'declined' | 'cancelled' } */
router.patch("/:id", async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["pending", "confirmed", "declined", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  const existing = await db.prepare("SELECT id FROM bookings WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Booking not found." });

  await db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, req.params.id);
  const row = await db.prepare(`${SELECT_JOINED} WHERE bk.id = ?`).get(req.params.id);
  res.json(rowToBooking(row));
});

module.exports = router;
