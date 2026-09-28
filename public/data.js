/* KasiBook — shared frontend helpers + API client.
   Data now lives in a real database on the backend (see /server.js and
   /db, /routes). This file just formats values and wraps fetch() calls
   to the REST API under /api/*. */

function kbFormatCurrency(n) {
  return "R" + Number(n).toFixed(0);
}

function kbFormatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

/* Next N available days, skipping nothing (kept simple for the demo) */
function kbNextDays(count = 7) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const KB_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

/* ---------- Photo upload helper ----------
   Reads a chosen file (from an <input type="file"> change event) and
   resolves to a base64 data URL, which is sent to the server and stored
   in the database (as TEXT) so no separate file storage is needed. */
function kbFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    if (file.size > 2 * 1024 * 1024) return reject(new Error("Image is too large (max 2MB)."));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

/* ---------- Tiny fetch wrapper ----------
   Always talks to the same origin the page is served from, so the
   frontend and backend can live in (and be deployed from) one folder. */
async function kbRequest(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* no JSON body */
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const KB_API = {
  customers: {
    register: (name, phone, password) => kbRequest("POST", "/api/customers/register", { name, phone, password }),
    login: (phone, password) => kbRequest("POST", "/api/customers/login", { phone, password })
  },
  businesses: {
    list: () => kbRequest("GET", "/api/businesses"),
    get: (id) => kbRequest("GET", `/api/businesses/${id}`),
    register: (payload) => kbRequest("POST", "/api/businesses/register", payload),
    login: (businessId, password) => kbRequest("POST", "/api/businesses/login", { businessId, password }),
    updateProfile: (id, payload) => kbRequest("PATCH", `/api/businesses/${id}`, payload),
    addService: (businessId, service) => kbRequest("POST", `/api/businesses/${businessId}/services`, service),
    updateServicePhoto: (businessId, serviceId, image) =>
      kbRequest("PATCH", `/api/businesses/${businessId}/services/${serviceId}`, { image }),
    removeService: (businessId, serviceId) => kbRequest("DELETE", `/api/businesses/${businessId}/services/${serviceId}`)
  },
  bookings: {
    listForCustomer: (customerId) => kbRequest("GET", `/api/bookings?customerId=${encodeURIComponent(customerId)}`),
    listForBusiness: (businessId) => kbRequest("GET", `/api/bookings?businessId=${encodeURIComponent(businessId)}`),
    create: (payload) => kbRequest("POST", "/api/bookings", payload),
    updateStatus: (id, status) => kbRequest("PATCH", `/api/bookings/${id}`, { status })
  }
};
