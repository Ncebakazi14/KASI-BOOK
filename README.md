# KasiBook

Booking platform for small businesses (barbers, salons, nail techs, food vendors, mechanics, etc). The frontend and backend live in **one folder** and are served by **one server**, backed by a real **Postgres database hosted on Supabase**, so registrations and bookings actually get saved.

## What changed from the original demo

- The old `data.js` kept everything in the browser's `localStorage`. It's been replaced with a small REST API client (`public/data.js`) that talks to a real backend.
- A new Express server (`server.js`) serves the frontend files from `public/` **and** exposes a JSON API under `/api/*`.
- Data is stored in a **Supabase Postgres database** (`db/index.js`, using the `pg` package), created automatically on first run.
- Passwords are hashed with `bcryptjs` before being stored — never saved as plain text.
- `public/customer.js` and `public/merchant.js` call the API instead of reading/writing `localStorage`, but the UI and user flow are unchanged.

## Project layout

```
kasibook/
├── server.js              # Express app: serves /public, mounts the API routes, inits the DB
├── db/
│   └── index.js           # Postgres (pg) connection pool, schema creation, demo data seeding
├── routes/
│   ├── customers.js       # POST /api/customers/register, /login
│   ├── businesses.js      # register/login/profile/services for business accounts
│   └── bookings.js        # create/list/update bookings
├── public/                # the frontend (served as static files)
│   ├── index.html         # customer-facing site
│   ├── dashboard.html     # business owner dashboard
│   ├── styles.css
│   ├── data.js             # formatting helpers + fetch()-based API client
│   ├── customer.js         # customer-side logic (calls the API)
│   └── merchant.js         # business-side logic (calls the API)
├── package.json
└── .env.example
```

## Requirements

- Node.js 18 or newer. Check with `node -v`.
- A free [Supabase](https://supabase.com) project (gives you the Postgres database).

## 1. Create your Supabase project & get the connection string

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**. Pick a name, a database password (save it somewhere), and a region close to your users.
2. Once the project is ready, go to **Project Settings -> Database -> Connection string -> URI** tab.
3. Copy the **Transaction pooler** connection string (port `6543`) — this works well from most hosts, including serverless ones. Replace `[YOUR-PASSWORD]` in it with the database password you set in step 1.

## 2. Configure the app

```bash
cd kasibook
cp .env.example .env
```

Open `.env` and paste your connection string into `DATABASE_URL`.

## 3. Run it

```bash
npm install       # only needed the first time
npm start
```

Then open **http://localhost:3000** in your browser. That single URL serves both:
- the customer site (`index.html`), and
- the business dashboard (`dashboard.html`, linked from the top nav).

On first run, the app automatically creates the tables in your Supabase database and seeds the same 6 demo businesses as the original front-end demo (password `kasi123` for all of them, stored as a bcrypt hash).

The server listens on port 3000 by default. To use a different port, set `PORT` in `.env`.

## Database

Tables (created automatically in your Supabase Postgres database on first run):
- **businesses** — id, name, category, owner, password_hash, location, tagline, icon, hue, photo, created_at
- **services** — id, business_id, name, price, duration, image
- **customers** — id, name, phone, password_hash, created_at
- **bookings** — id, business_id, service_id, customer_id, date, time, status, paid, amount_paid, payment_ref, created_at

To inspect the data, open your Supabase project's **Table Editor** or **SQL Editor** in the dashboard — no separate client needed.

## API summary

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/customers/register` | Create a customer account `{name, phone, password}` |
| POST | `/api/customers/login` | Log in `{phone, password}` |
| GET | `/api/businesses` | List all businesses (with their services) |
| GET | `/api/businesses/:id` | Get one business |
| POST | `/api/businesses/register` | Create a business account `{name, category, owner, location, password}` |
| POST | `/api/businesses/login` | Log in `{businessId, password}` |
| PATCH | `/api/businesses/:id` | Update profile `{name, tagline, location, photo}` |
| POST | `/api/businesses/:id/services` | Add a service `{name, price, duration, image?}` |
| PATCH | `/api/businesses/:id/services/:serviceId` | Set/clear a service photo `{image}` |
| DELETE | `/api/businesses/:id/services/:serviceId` | Remove a service |
| GET | `/api/bookings?customerId=` or `?businessId=` | List bookings |
| POST | `/api/bookings` | Create + mock-pay a booking `{businessId, serviceId, customerId, date, time}` |
| PATCH | `/api/bookings/:id` | Update status `{status: pending\|confirmed\|declined\|cancelled}` |

## Deploying

Supabase hosts the **database only** — it doesn't run your Express server. Deploy this app (the whole `kasibook/` folder) to a Node host such as Render, Railway, or Fly.io, and set the same `DATABASE_URL` (and optionally `PORT`) as environment variables there. Once deployed, that host's URL serves both the frontend and the API, exactly like `localhost:3000` does now.

## Notes / what's still "demo-grade"

- There's no session/token auth — the frontend just remembers the logged-in customer/business's id in `sessionStorage` after a successful login and sends it with requests. Good enough for a demo; for a real production deploy you'd want proper sessions or JWTs and per-request authorization checks on the business/customer-scoped routes.
- Payment is still fully mocked (no card is ever charged) — only the card-details form validation happens client-side, exactly like the original.
- Photos are stored as base64 data URLs directly in the database (capped at 2MB client-side). Fine for a demo; for real use you'd move these to file/object storage (e.g. Supabase Storage).
