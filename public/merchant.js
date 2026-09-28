/* KasiBook — merchant dashboard logic (talks to the backend API/database) */

let allBusinesses = [];    // cache for the login dropdown
let currentBiz = JSON.parse(sessionStorage.getItem("kb_session_biz") || "null"); // full biz+services, refreshed on load
let currentView = "bookings";
let bookingFilter = "all";

const authWrap = document.getElementById("authWrap");
const dashShell = document.getElementById("dashShell");
const loginBizSelect = document.getElementById("loginBiz");
const loginPass = document.getElementById("loginPass");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authTitle = document.getElementById("authTitle");
const authSub = document.getElementById("authSub");
const registerBtn = document.getElementById("registerBtn");
const registerError = document.getElementById("registerError");

function setAuthMode(mode) {
  const isLogin = mode === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabRegister.classList.toggle("active", !isLogin);
  loginForm.style.display = isLogin ? "block" : "none";
  registerForm.style.display = isLogin ? "none" : "block";
  authTitle.textContent = isLogin ? "Business login" : "Register your business";
  authSub.textContent = isLogin ? "No more WhatsApp bookings or notebooks — see your bookings, cancellations, services and customers in one place." : "List your business on KasiBook in under a minute — any service, any trade.";
}
tabLogin.addEventListener("click", () => setAuthMode("login"));
tabRegister.addEventListener("click", () => setAuthMode("register"));

registerBtn.addEventListener("click", async () => {
  const name = document.getElementById("regName").value.trim();
  const category = document.getElementById("regCategory").value.trim();
  const owner = document.getElementById("regOwner").value.trim();
  const location = document.getElementById("regLocation").value.trim();
  const password = document.getElementById("regPassword").value;

  registerError.style.display = "none";
  if (!name || !category || !owner || !location || !password) {
    registerError.textContent = "Please fill in every field.";
    registerError.style.display = "block";
    return;
  }

  registerBtn.disabled = true;
  try {
    const biz = await KB_API.businesses.register({ name, category, owner, location, password });
    currentBiz = biz;
    sessionStorage.setItem("kb_session_biz", JSON.stringify(biz));
    showDashboard();
  } catch (e) {
    registerError.textContent = e.message;
    registerError.style.display = "block";
  } finally {
    registerBtn.disabled = false;
  }
});

const dashMain = document.getElementById("dashMain");
const sideBizName = document.getElementById("sideBizName");
const sideBizCat = document.getElementById("sideBizCat");
const dashNav = document.getElementById("dashNav");
const logoutBtn = document.getElementById("logoutBtn");

async function populateLoginOptions() {
  try {
    allBusinesses = await KB_API.businesses.list();
  } catch (e) {
    loginBizSelect.innerHTML = `<option>Couldn't load businesses</option>`;
    return;
  }
  loginBizSelect.innerHTML = allBusinesses.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
}

function tryLogin() {
  const businessId = loginBizSelect.value;
  const password = loginPass.value;
  loginError.style.display = "none";
  loginBtn.disabled = true;
  KB_API.businesses.login(businessId, password)
    .then(biz => {
      currentBiz = biz;
      sessionStorage.setItem("kb_session_biz", JSON.stringify(biz));
      showDashboard();
    })
    .catch(e => {
      loginError.textContent = e.message;
      loginError.style.display = "block";
    })
    .finally(() => { loginBtn.disabled = false; });
}
loginBtn.addEventListener("click", tryLogin);
loginPass.addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("kb_session_biz");
  currentBiz = null;
  authWrap.style.display = "flex";
  dashShell.style.display = "none";
  loginPass.value = "";
  populateLoginOptions();
});

dashNav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  currentView = btn.dataset.view;
  dashNav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderView();
});

function showDashboard() {
  authWrap.style.display = "none";
  dashShell.style.display = "flex";
  sideBizName.textContent = currentBiz.name;
  sideBizCat.textContent = currentBiz.category;
  renderView();
}

/* Re-fetch the logged-in business (with its current services) from the server */
async function refreshCurrentBiz() {
  currentBiz = await KB_API.businesses.get(currentBiz.id);
  sessionStorage.setItem("kb_session_biz", JSON.stringify(currentBiz));
  return currentBiz;
}

function renderView() {
  if (currentView === "bookings") renderBookings();
  else if (currentView === "services") renderServices();
  else if (currentView === "customers") renderCustomers();
  else if (currentView === "profile") renderProfile();
}

/* ---------- Bookings view ---------- */
const KB_BOOKING_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "cancelled", label: "Cancelled" }
];

async function renderBookings() {
  dashMain.innerHTML = `<div class="empty-state">Loading…</div>`;
  const biz = await refreshCurrentBiz();
  let bookings;
  try {
    bookings = await KB_API.bookings.listForBusiness(biz.id);
  } catch (e) {
    dashMain.innerHTML = `<div class="empty-state">Couldn't load bookings.</div>`;
    return;
  }

  const pending = bookings.filter(b => b.status === "pending").length;
  const confirmed = bookings.filter(b => b.status === "confirmed").length;
  const cancelled = bookings.filter(b => b.status === "cancelled" || b.status === "declined").length;
  const revenue = bookings
    .filter(b => b.status === "confirmed")
    .reduce((sum, bk) => {
      const s = biz.services.find(s => s.id === bk.serviceId);
      return sum + (s ? s.price : 0);
    }, 0);

  const visible = bookings.filter(bk => {
    if (bookingFilter === "all") return true;
    if (bookingFilter === "active") return bk.status === "pending" || bk.status === "confirmed";
    if (bookingFilter === "cancelled") return bk.status === "cancelled" || bk.status === "declined";
    return bk.status === bookingFilter;
  });

  dashMain.innerHTML = `
    <h2>Bookings</h2>
    <div class="dash-sub">View incoming requests, keep track of cancellations and manage your schedule.</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="val">${bookings.length}</div><div class="lbl">Total bookings</div></div>
      <div class="stat-card"><div class="val">${pending}</div><div class="lbl">Pending</div></div>
      <div class="stat-card"><div class="val">${confirmed}</div><div class="lbl">Confirmed</div></div>
      <div class="stat-card"><div class="val">${cancelled}</div><div class="lbl">Cancelled</div></div>
      <div class="stat-card"><div class="val">${kbFormatCurrency(revenue)}</div><div class="lbl">Confirmed revenue</div></div>
    </div>
    <div class="pill-row" id="bookingFilterRow" style="margin-bottom:16px;">
      ${KB_BOOKING_FILTERS.map(f => `<button class="pill ${bookingFilter === f.key ? "active" : ""}" data-filter="${f.key}">${f.label}</button>`).join("")}
    </div>
    <div class="table-wrap">
      ${visible.length === 0 ? `<div class="empty-state">${bookings.length === 0 ? "No bookings yet. Share your KasiBook page to get your first one." : "No bookings in this view."}</div>` : `
      <table>
        <thead><tr><th>Customer</th><th>Service</th><th>Date</th><th>Time</th><th>Paid</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${visible.map(bk => {
            const service = biz.services.find(s => s.id === bk.serviceId);
            let note = "";
            if (bk.status === "cancelled") note = `<div style="font-size:11.5px;color:rgba(32,27,15,0.5);margin-top:3px;">Cancelled by customer</div>`;
            if (bk.status === "declined") note = `<div style="font-size:11.5px;color:rgba(32,27,15,0.5);margin-top:3px;">Declined by you</div>`;
            return `
              <tr>
                <td>${bk.customerName}<br><span style="color:rgba(32,27,15,0.55);font-size:12.5px;">${bk.customerPhone}</span></td>
                <td>${service ? service.name : "—"}</td>
                <td>${kbFormatDate(bk.date)}</td>
                <td>${bk.time}</td>
                <td>${bk.paid ? kbFormatCurrency(bk.amountPaid) : "—"}</td>
                <td><span class="status-tag status-${bk.status}">${bk.status}</span>${note}</td>
                <td>
                  ${bk.status === "pending" ? `
                    <div class="row-actions">
                      <button class="mini-btn accept" data-act="accept" data-id="${bk.id}">Accept</button>
                      <button class="mini-btn decline" data-act="decline" data-id="${bk.id}">Decline</button>
                    </div>` : ""}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>`}
    </div>
  `;

  dashMain.querySelector("#bookingFilterRow").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    bookingFilter = btn.dataset.filter;
    renderBookings();
  });

  dashMain.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.act === "accept" ? "confirmed" : "declined";
      try {
        await KB_API.bookings.updateStatus(btn.dataset.id, status);
        renderBookings();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

/* ---------- Services view ---------- */
async function renderServices() {
  dashMain.innerHTML = `<div class="empty-state">Loading…</div>`;
  const biz = await refreshCurrentBiz();

  dashMain.innerHTML = `
    <h2>Services</h2>
    <div class="dash-sub">These are what customers see and book on your page. Add a photo of each service — a good picture is often what convinces a customer to book.</div>
    ${biz.services.length === 0 ? `<div class="empty-state">You haven't added any services yet — add your first one below.</div>` : biz.services.map(s => `
      <div class="service-manage-row">
        <div class="svc-manage-left">
          ${s.image
            ? `<img class="svc-thumb" src="${s.image}" alt="${s.name}">`
            : `<div class="svc-thumb svc-thumb-empty hue-${biz.hue}">${biz.icon}</div>`}
          <div>
            <div style="font-weight:700;">${s.name}</div>
            <div style="font-size:12.5px;color:rgba(32,27,15,0.6);">${s.duration} min · ${kbFormatCurrency(s.price)}</div>
          </div>
        </div>
        <div class="row-actions">
          <label class="mini-btn photo-btn">
            ${s.image ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*" class="photo-input-hidden" data-photo-for="${s.id}">
          </label>
          ${s.image ? `<button class="mini-btn decline" data-remove-photo="${s.id}">Remove photo</button>` : ""}
          <button class="mini-btn decline" data-remove="${s.id}">Remove</button>
        </div>
      </div>
    `).join("")}
    <div class="add-service-box">
      <div>
        <label class="field-label" style="margin-top:0;">Service name</label>
        <input class="field-input" id="newServiceName" placeholder="e.g. Haircut">
      </div>
      <div>
        <label class="field-label" style="margin-top:0;">Price (R)</label>
        <input class="field-input" id="newServicePrice" type="number" min="0">
      </div>
      <div>
        <label class="field-label" style="margin-top:0;">Duration (min)</label>
        <input class="field-input" id="newServiceDuration" type="number" min="0">
      </div>
      <div>
        <label class="field-label" style="margin-top:0;">Photo (optional)</label>
        <input class="field-input" id="newServicePhoto" type="file" accept="image/*">
      </div>
      <button class="btn btn-orange" id="addServiceBtn">Add</button>
    </div>
    <div class="error-msg" id="servicePhotoError"></div>
  `;

  const photoErr = dashMain.querySelector("#servicePhotoError");
  function showPhotoError(msg) {
    photoErr.textContent = msg;
    photoErr.style.display = "block";
  }

  dashMain.querySelectorAll("button[data-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await KB_API.businesses.removeService(biz.id, btn.dataset.remove);
        renderServices();
      } catch (e) {
        showPhotoError(e.message);
      }
    });
  });

  dashMain.querySelectorAll("button[data-remove-photo]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await KB_API.businesses.updateServicePhoto(biz.id, btn.dataset.removePhoto, null);
        renderServices();
      } catch (e) {
        showPhotoError(e.message);
      }
    });
  });

  dashMain.querySelectorAll("input[data-photo-for]").forEach(input => {
    input.addEventListener("change", async () => {
      try {
        const dataUrl = await kbFileToDataUrl(input.files[0]);
        if (!dataUrl) return;
        await KB_API.businesses.updateServicePhoto(biz.id, input.dataset.photoFor, dataUrl);
        renderServices();
      } catch (err) {
        showPhotoError(err.message);
      }
    });
  });

  dashMain.querySelector("#addServiceBtn").addEventListener("click", async () => {
    const name = dashMain.querySelector("#newServiceName").value.trim();
    const price = parseFloat(dashMain.querySelector("#newServicePrice").value);
    const duration = parseInt(dashMain.querySelector("#newServiceDuration").value, 10);
    const photoFile = dashMain.querySelector("#newServicePhoto").files[0];
    if (!name || isNaN(price) || isNaN(duration)) {
      showPhotoError("Please fill in the service name, price and duration.");
      return;
    }
    let image = null;
    try {
      image = await kbFileToDataUrl(photoFile);
    } catch (err) {
      showPhotoError(err.message);
      return;
    }
    try {
      await KB_API.businesses.addService(biz.id, { name, price, duration, image });
      renderServices();
    } catch (err) {
      showPhotoError(err.message);
    }
  });
}

/* ---------- Customers view ---------- */
async function renderCustomers() {
  dashMain.innerHTML = `<div class="empty-state">Loading…</div>`;
  let bookings;
  try {
    bookings = await KB_API.bookings.listForBusiness(currentBiz.id);
  } catch (e) {
    dashMain.innerHTML = `<div class="empty-state">Couldn't load customers.</div>`;
    return;
  }

  const byPhone = {};
  bookings.forEach(bk => {
    if (!byPhone[bk.customerPhone]) {
      byPhone[bk.customerPhone] = { name: bk.customerName, phone: bk.customerPhone, count: 0, last: bk.date };
    }
    byPhone[bk.customerPhone].count += 1;
    if (bk.date > byPhone[bk.customerPhone].last) byPhone[bk.customerPhone].last = bk.date;
  });
  const customers = Object.values(byPhone);

  dashMain.innerHTML = `
    <h2>Customers</h2>
    <div class="dash-sub">Everyone who has booked with you, built automatically from your bookings.</div>
    <div class="table-wrap">
      ${customers.length === 0 ? `<div class="empty-state">No customer records yet.</div>` : `
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Bookings</th><th>Last visit</th></tr></thead>
        <tbody>
          ${customers.map(c => `
            <tr>
              <td>${c.name}</td>
              <td>${c.phone}</td>
              <td>${c.count}</td>
              <td>${kbFormatDate(c.last)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`}
    </div>
  `;
}

/* ---------- Profile view ---------- */
async function renderProfile() {
  dashMain.innerHTML = `<div class="empty-state">Loading…</div>`;
  const biz = await refreshCurrentBiz();

  dashMain.innerHTML = `
    <h2>Business profile</h2>
    <div class="dash-sub">This is what customers see on your KasiBook page. A cover photo helps customers recognise and trust your business at a glance.</div>
    <div class="profile-form">
      <label class="field-label" style="margin-top:0;">Cover photo</label>
      <div class="svc-manage-left" style="margin-bottom:6px;">
        ${biz.photo
          ? `<img class="svc-thumb svc-thumb-lg" src="${biz.photo}" alt="${biz.name}">`
          : `<div class="svc-thumb svc-thumb-lg svc-thumb-empty hue-${biz.hue}">${biz.icon}</div>`}
        <div class="row-actions">
          <label class="mini-btn photo-btn">
            ${biz.photo ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*" class="photo-input-hidden" id="pPhotoInput">
          </label>
          ${biz.photo ? `<button class="mini-btn decline" id="pPhotoRemove">Remove photo</button>` : ""}
        </div>
      </div>
      <div class="error-msg" id="pPhotoError"></div>

      <label class="field-label">Business name</label>
      <input class="field-input" id="pName" value="${biz.name}">

      <label class="field-label">Tagline</label>
      <input class="field-input" id="pTagline" value="${biz.tagline}">

      <label class="field-label">Location</label>
      <input class="field-input" id="pLocation" value="${biz.location}">

      <button class="btn btn-orange btn-block" style="margin-top:20px;" id="saveProfileBtn">Save changes</button>
      <div id="savedMsg" style="display:none;color:var(--green-deep);font-weight:700;font-size:13px;margin-top:10px;">Saved.</div>
    </div>
  `;

  const pPhotoError = dashMain.querySelector("#pPhotoError");

  dashMain.querySelector("#pPhotoInput").addEventListener("change", async (e) => {
    try {
      const dataUrl = await kbFileToDataUrl(e.target.files[0]);
      if (!dataUrl) return;
      await KB_API.businesses.updateProfile(biz.id, { photo: dataUrl });
      renderProfile();
    } catch (err) {
      pPhotoError.textContent = err.message;
      pPhotoError.style.display = "block";
    }
  });

  const removeBtn = dashMain.querySelector("#pPhotoRemove");
  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      try {
        await KB_API.businesses.updateProfile(biz.id, { photo: null });
        renderProfile();
      } catch (err) {
        pPhotoError.textContent = err.message;
        pPhotoError.style.display = "block";
      }
    });
  }

  dashMain.querySelector("#saveProfileBtn").addEventListener("click", async () => {
    const name = dashMain.querySelector("#pName").value.trim() || biz.name;
    const tagline = dashMain.querySelector("#pTagline").value.trim() || biz.tagline;
    const location = dashMain.querySelector("#pLocation").value.trim() || biz.location;
    try {
      await refreshCurrentBiz();
      const updated = await KB_API.businesses.updateProfile(biz.id, { name, tagline, location });
      currentBiz = updated;
      sessionStorage.setItem("kb_session_biz", JSON.stringify(updated));
      sideBizName.textContent = updated.name;
      document.getElementById("savedMsg").style.display = "block";
    } catch (err) {
      pPhotoError.textContent = err.message;
      pPhotoError.style.display = "block";
    }
  });
}

/* ---------- Init ---------- */
populateLoginOptions();
if (currentBiz && currentBiz.id) {
  showDashboard();
}