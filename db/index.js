const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dns = require("dns");
const { Pool } = require("pg");

// Some networks have broken/unreliable IPv6, which can make Node
// intermittently fail to resolve hostnames (it may try an IPv6 address
// first depending on DNS response order). Preferring IPv4 avoids that.
dns.setDefaultResultOrder("ipv4first");

// DATABASE_URL comes from your Supabase project: Project Settings -> Database
// -> Connection string ("URI" tab, "Transaction pooler" recommended for
// serverless/most hosts). Supabase requires SSL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Idle connections can be dropped by the pooler/network at any time. Without
// this handler, that would crash the whole process instead of just being logged.
pool.on("error", (err) => {
  console.error("Unexpected idle database connection error:", err.message);
});

/* ---------- Tiny compatibility layer ----------
   Keeps the rest of the app (routes/*.js) looking almost exactly like it
   did with better-sqlite3/node:sqlite: db.prepare(sql).get(...params),
   .all(...params), .run(...params) — just async now, since Postgres over
   the network can't be synchronous. Positional "?" placeholders are
   converted to Postgres's "$1, $2, ..." style automatically. */
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Some home/campus networks have flaky DNS or brief drops. Rather than
// surfacing a "server error" to the user on a one-off network hiccup,
// retry a few times with a short backoff before giving up for real.
async function queryWithRetry(sql, params, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      lastErr = err;
      const transient = ["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(err.code);
      if (!transient || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

function prepare(sql) {
  const pgSql = toPgPlaceholders(sql);
  return {
    async get(...params) {
      const { rows } = await queryWithRetry(pgSql, params);
      return rows[0];
    },
    async all(...params) {
      const { rows } = await queryWithRetry(pgSql, params);
      return rows;
    },
    async run(...params) {
      const result = await queryWithRetry(pgSql, params);
      return { changes: result.rowCount };
    }
  };
}

function newId(prefix) {
  return prefix + "_" + crypto.randomBytes(6).toString("hex");
}

/* ---------- Schema ---------- */
async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      category      TEXT NOT NULL,
      owner         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      location      TEXT NOT NULL,
      tagline       TEXT DEFAULT '',
      icon          TEXT DEFAULT '🏪',
      hue           TEXT DEFAULT 'green',
      photo         TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id          TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      price       REAL NOT NULL,
      duration    INTEGER NOT NULL,
      image       TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id           TEXT PRIMARY KEY,
      business_id  TEXT NOT NULL REFERENCES businesses(id),
      service_id   TEXT NOT NULL,
      customer_id  TEXT NOT NULL REFERENCES customers(id),
      date         TEXT NOT NULL,
      time         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      paid         INTEGER NOT NULL DEFAULT 0,
      amount_paid  REAL DEFAULT 0,
      payment_ref  TEXT,
      created_at   TEXT NOT NULL
    );
  `);
}

/* ---------- Seed demo businesses on first run only ---------- */
async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*) AS n FROM businesses");
  if (parseInt(rows[0].n, 10) > 0) return;

  const SEED = [
    { name: "Thabo's Fade Palace", category: "Barber", owner: "Thabo Mokoena", location: "NY1, Khayelitsha",
      tagline: "Sharpest fades in the kasi. No appointment, no wait.", icon: "✂️", hue: "orange",
      services: [["Skin Fade", 60, 30], ["Fade + Beard Line", 90, 45], ["Kids Cut", 40, 20]] },
    { name: "Nolwazi Nails & Beauty", category: "Nail Technician", owner: "Nolwazi Dlamini", location: "Site C, Khayelitsha",
      tagline: "Gel sets, nail art and pamper sessions done right.", icon: "💅", hue: "gold",
      services: [["Gel Overlay", 120, 60], ["Full Set + Art", 180, 90], ["Pedicure", 100, 45]] },
    { name: "Sis' Ntombi Kota Corner", category: "Food Vendor", owner: "Ntombi Zulu", location: "Harare, Khayelitsha",
      tagline: "The kota that started the queue down the street.", icon: "🥪", hue: "green",
      services: [["Full House Kota", 45, 15], ["Half Kota", 30, 15], ["Kota + Amagwinya Combo", 55, 15]] },
    { name: "Sipho's Auto Repairs", category: "Mechanic", owner: "Sipho Nkosi", location: "Town 2, Khayelitsha",
      tagline: "Honest diagnostics and same-day fixes.", icon: "🔧", hue: "orange",
      services: [["General Service", 450, 120], ["Brake Check & Fix", 350, 90], ["Diagnostic Scan", 150, 30]] },
    { name: "Zanele's Hair Studio", category: "Salon", owner: "Zanele Mtshali", location: "Ilitha Park, Khayelitsha",
      tagline: "Braids, weaves and blow-outs for every occasion.", icon: "💇🏾‍♀️", hue: "gold",
      services: [["Box Braids", 250, 180], ["Wash & Blow Dry", 100, 45], ["Weave Install", 300, 150]] },
    { name: "Amanda's Beauty Bar", category: "Beauty Therapist", owner: "Amanda Peters", location: "Town Centre, Khayelitsha",
      tagline: "Facials, lashes and nails — look good, feel better.", icon: "💄", hue: "orange",
      services: [["Classic Facial", 220, 60], ["Lash Extensions", 280, 75], ["Manicure", 90, 30]] }
  ];

  const insertBiz = prepare(`INSERT INTO businesses
    (id, name, category, owner, password_hash, location, tagline, icon, hue, photo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`);
  const insertSvc = prepare(`INSERT INTO services (id, business_id, name, price, duration, image)
    VALUES (?, ?, ?, ?, ?, NULL)`);

  const passwordHash = bcrypt.hashSync("kasi123", 10);

  for (const b of SEED) {
    const id = newId("b");
    await insertBiz.run(id, b.name, b.category, b.owner, passwordHash, b.location, b.tagline, b.icon, b.hue, new Date().toISOString());
    for (const [name, price, duration] of b.services) {
      await insertSvc.run(newId("s"), id, name, price, duration);
    }
  }
  console.log("Seeded demo businesses (password for all demo businesses: kasi123)");
}

async function init() {
  await createSchema();
  await seedIfEmpty();
}

module.exports = { db: { prepare }, newId, init, pool };