/* KasiBook — customer dashboard logic
   Flow: register/login -> dashboard -> browse -> pick service -> pick
   date & time -> pay -> confirmation. Business + service data and every
   booking now live in the backend database; this file just renders
   whatever the API returns and sends writes (register, book, cancel)
   back to it. */

let kbBusinesses = [];               // cache of businesses+services from the server
let activeCategory = "All";
let bookingDraft = null;             // { businessId, serviceId, date, time }
let currentCustomer = JSON.parse(sessionStorage.getItem("kb_session_customer") || "null");

const landingScreen = document.getElementById("landingScreen");
const dashboardScreen = document.getElementById("dashboardScreen");
const topAuthBtn = document.getElementById("topAuthBtn");
const heroSignupBtn = document.getElementById("heroSignupBtn");
const heroLoginBtn = document.getElementById("heroLoginBtn");
const custGreetName = document.getElementById("custGreetName");
const custLogoutBtn = document.getElementById("custLogoutBtn");
const custTabRow = document.getElementById("custTabRow");
const browseTab = document.getElementById("browseTab");
const bookingsTab = document.getElementById("bookingsTab");
const bookingsList = document.getElementById("bookingsList");

const bizGrid = document.getElementById("bizGrid");
const categoryPills = document.getElementById("categoryPills");
const modalBackdrop = document.getElementById("bizModal");
const modalContent = document.getElementById("bizModalContent");

/* ---------- Screen switching ---------- */
async function renderAuthState() {
  if (currentCustomer) {
    landingScreen.style.display = "none";
    dashboardScreen.style.display = "block";
    topAuthBtn.style.display = "none";
    custGreetName.textContent = currentCustomer.name.split(" ")[0];
    await renderBrowseTab();
  } else {
    landingScreen.style.display = "block";
    dashboardScreen.style.display = "none";
    topAuthBtn.style.display = "inline-block";
    topAuthBtn.textContent = "Log in / Sign up";
  }
}

topAuthBtn.addEventListener("click", () => openAuthModal("login"));
heroSignupBtn.addEventListener("click", () => openAuthModal("register"));
heroLoginBtn.addEventListener("click", () => openAuthModal("login"));
custLogoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("kb_session_customer");
  currentCustomer = null;
  renderAuthState();
});

custTabRow.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  custTabRow.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  const tab = btn.dataset.tab;
  browseTab.style.display = tab === "browse" ? "block" : "none";
  bookingsTab.style.display = tab === "bookings" ? "block" : "none";
  if (tab === "bookings") renderBookingsTab();
});

/* ---------- Browse tab ---------- */
function categories() {
  const set = new Set(kbBusinesses.map(b => b.category));
  return ["All", ...Array.from(set)];
}

function renderPills() {
  categoryPills.innerHTML = categories().map(cat => `
    <button class="pill ${cat === activeCategory ? "active" : ""}" data-cat="${cat}">${cat}</button>
  `).join("");
  categoryPills.querySelectorAll(".pill").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderPills();
      renderGrid();
    });
  });
}

function renderGrid() {
  const list = kbBusinesses.filter(b => activeCategory === "All" || b.category === activeCategory);
  bizGrid.innerHTML = list.map(b => `
    <div class="biz-card" data-id="${b.id}">
      ${b.photo ? `<div class="biz-card-photo" style="background-image:url('${b.photo}')"></div>` : ""}
      <div class="biz-icon hue-${b.hue}">${b.icon}</div>
      <div class="biz-cat">${b.category}</div>
      <h3>${b.name}</h3>
      <p>${b.tagline}</p>
      <div class="biz-loc">📍 ${b.location}</div>
    </div>
  `).join("");
  bizGrid.querySelectorAll(".biz-card").forEach(card => {
    card.addEventListener("click", () => openBusiness(card.dataset.id));
  });
}

async function renderBrowseTab() {
  try {
    kbBusinesses = await KB_API.businesses.list();
  } catch (e) {
    bizGrid.innerHTML = `<div class="empty-state">Couldn't load businesses — is the server running?</div>`;
    return;
  }
  renderPills();
  renderGrid();
}

/* ---------- My bookings tab ---------- */
async function renderBookingsTab() {
  bookingsList.innerHTML = `<div class="empty-state">Loading…</div>`;
  let mine;
  try {
    mine = await KB_API.bookings.listForCustomer(currentCustomer.id);
  } catch (e) {
    bookingsList.innerHTML = `<div class="empty-state">Couldn't load your bookings.</div>`;
    return;
  }

  bookingsList.innerHTML = mine.length === 0
    ? `<div class="empty-state">No bookings yet — head to Browse businesses to book your first service.</div>`
    : `<div class="table-wrap"><table>
        <thead><tr><th>Business</th><th>Service</th><th>Date</th><th>Time</th><th>Paid</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${mine.map(bk => {
            const biz = kbBusinesses.find(b => b.id === bk.businessId);
            const service = biz ? biz.services.find(s => s.id === bk.serviceId) : null;
            const cancellable = bk.status === "pending" || bk.status === "confirmed";
            return `
              <tr>
                <td>${biz ? biz.name : "—"}</td>
                <td>${service ? service.name : "—"}</td>
                <td>${kbFormatDate(bk.date)}</td>
                <td>${bk.time}</td>
                <td>${bk.paid ? kbFormatCurrency(bk.amountPaid) : "—"}</td>
                <td><span class="status-tag status-${bk.status}">${bk.status}</span></td>
                <td>${cancellable ? `<button class="mini-btn decline" data-cancel="${bk.id}">Cancel</button>` : ""}</td>
              </tr>`;
          }).join("")}
        </tbody>
      </table></div>`;

  bookingsList.querySelectorAll("button[data-cancel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancel this booking?")) return;
      try {
        await KB_API.bookings.updateStatus(btn.dataset.cancel, "cancelled");
        renderBookingsTab();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

/* ---------- Modal helpers ---------- */
function openModal(html) {
  modalContent.innerHTML = html;
  modalBackdrop.classList.add("open");
}
function closeModal() {
  modalBackdrop.classList.remove("open");
}
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

/* ---------- Auth modal (login / register) ---------- */
function openAuthModal(mode) {
  renderAuthModal(mode || "login");
}

function renderAuthModal(mode) {
  openModal(`
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h2>${mode === "login" ? "Log in" : "Create your account"}</h2>
    <p style="font-size:13px;color:rgba(32,27,15,0.6);margin:4px 0 14px;">Browse local businesses, book a service and pay — all in one place.</p>
    <div class="auth-tabs">
      <button data-tab="login" class="${mode === "login" ? "active" : ""}">Log in</button>
      <button data-tab="register" class="${mode === "register" ? "active" : ""}">Sign up</button>
    </div>
    <div id="authFields"></div>
    <div class="error-msg" id="authError"></div>
    <button class="btn btn-orange btn-block" style="margin-top:18px;" id="authSubmit">${mode === "login" ? "Log in" : "Create account"}</button>
  `);

  modalContent.querySelectorAll(".auth-tabs button").forEach(t => {
    t.addEventListener("click", () => renderAuthModal(t.dataset.tab));
  });

  const fields = modalContent.querySelector("#authFields");
  if (mode === "login") {
    fields.innerHTML = `
      <label class="field-label" style="margin-top:0;">Cellphone number</label>
      <input class="field-input" id="authPhone">
      <label class="field-label">Password</label>
      <input class="field-input" id="authPassword" type="password">
    `;
  } else {
    fields.innerHTML = `
      <label class="field-label" style="margin-top:0;">Your name</label>
      <input class="field-input" id="authName">
      <label class="field-label">Cellphone number</label>
      <input class="field-input" id="authPhone">
      <label class="field-label">Choose a password</label>
      <input class="field-input" id="authPassword" type="password">
    `;
  }

  modalContent.querySelector("#authSubmit").addEventListener("click", async () => {
    const errBox = modalContent.querySelector("#authError");
    const submitBtn = modalContent.querySelector("#authSubmit");
    const phone = modalContent.querySelector("#authPhone").value.trim();
    const password = modalContent.querySelector("#authPassword").value;
    errBox.style.display = "none";

    if (mode === "login") {
      submitBtn.disabled = true;
      try {
        const cust = await KB_API.customers.login(phone, password);
        currentCustomer = cust;
        sessionStorage.setItem("kb_session_customer", JSON.stringify(cust));
        closeModal();
        renderAuthState();
      } catch (e) {
        errBox.textContent = e.message;
        errBox.style.display = "block";
      } finally {
        submitBtn.disabled = false;
      }
    } else {
      const name = modalContent.querySelector("#authName").value.trim();
      if (!name || !phone || !password) {
        errBox.textContent = "Please fill in every field.";
        errBox.style.display = "block";
        return;
      }
      submitBtn.disabled = true;
      try {
        const cust = await KB_API.customers.register(name, phone, password);
        currentCustomer = cust;
        sessionStorage.setItem("kb_session_customer", JSON.stringify(cust));
        closeModal();
        renderAuthState();
      } catch (e) {
        errBox.textContent = e.message;
        errBox.style.display = "block";
      } finally {
        submitBtn.disabled = false;
      }
    }
  });
}

/* ---------- Booking flow (only reachable once logged in) ---------- */

/* Step 1: business profile + service picker */
function openBusiness(id) {
  const biz = kbBusinesses.find(b => b.id === id);
  bookingDraft = { businessId: id, serviceId: null, date: null, time: null };
  openModal(`
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <div class="biz-cat">${biz.category}</div>
    <h2>${biz.name}</h2>
    <p style="font-size:14px;color:rgba(32,27,15,0.65);margin:6px 0 4px;">${biz.tagline}</p>
    <p style="font-size:13px;font-weight:600;color:var(--green-deep);">📍 ${biz.location}</p>
    <div class="field-label">Choose a service</div>
    ${biz.services.length === 0 ? `<p style="font-size:13px;color:rgba(32,27,15,0.55);margin-top:10px;">This business hasn't added any services yet.</p>` : biz.services.map(s => `
      <div class="service-row" data-sid="${s.id}">
        <div class="s-left">
          ${s.image
            ? `<img class="s-thumb" src="${s.image}" alt="${s.name}">`
            : `<div class="s-thumb s-thumb-empty hue-${biz.hue}">${biz.icon}</div>`}
          <div>
            <div class="s-name">${s.name}</div>
            <div class="s-meta">${s.duration} min</div>
          </div>
        </div>
        <div class="s-price">${kbFormatCurrency(s.price)}</div>
      </div>
    `).join("")}
    <button class="btn btn-orange btn-block" style="margin-top:22px;" id="toStepDate" disabled>Choose date & time</button>
  `);

  modalContent.querySelectorAll(".service-row").forEach(row => {
    row.addEventListener("click", () => {
      modalContent.querySelectorAll(".service-row").forEach(r => r.classList.remove("selected"));
      row.classList.add("selected");
      bookingDraft.serviceId = row.dataset.sid;
      modalContent.querySelector("#toStepDate").disabled = false;
    });
  });
  modalContent.querySelector("#toStepDate").addEventListener("click", () => openDateTime(id));
}

/* Step 2: date & time */
async function openDateTime(bizId) {
  const biz = kbBusinesses.find(b => b.id === bizId);
  const service = biz.services.find(s => s.id === bookingDraft.serviceId);
  const days = kbNextDays(7);

  let existingBookings = [];
  try {
    existingBookings = await KB_API.bookings.listForBusiness(bizId);
  } catch (e) {
    /* if this fails we just won't grey out taken slots */
  }

  openModal(`
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <div class="biz-cat">${biz.category}</div>
    <h2>${biz.name}</h2>
    <p style="font-size:14px;color:rgba(32,27,15,0.65);margin:6px 0 4px;">${service.name} · ${kbFormatCurrency(service.price)} · ${service.duration} min</p>

    <div class="field-label">Pick a date</div>
    <div class="chip-row" id="dateChips">
      ${days.map(d => `<button class="chip" data-date="${d}">${kbFormatDate(d)}</button>`).join("")}
    </div>

    <div class="field-label">Pick a time</div>
    <div class="chip-row" id="timeChips">
      ${KB_TIMES.map(t => `<button class="chip" data-time="${t}">${t}</button>`).join("")}
    </div>

    <button class="btn btn-orange btn-block" style="margin-top:22px;" id="toStepPay" disabled>Continue to payment</button>
  `);

  const dateChips = modalContent.querySelectorAll("#dateChips .chip");
  const timeChips = modalContent.querySelectorAll("#timeChips .chip");
  const continueBtn = modalContent.querySelector("#toStepPay");

  function checkReady() {
    continueBtn.disabled = !(bookingDraft.date && bookingDraft.time);
  }

  dateChips.forEach(c => c.addEventListener("click", () => {
    dateChips.forEach(x => x.classList.remove("selected"));
    c.classList.add("selected");
    bookingDraft.date = c.dataset.date;
    bookingDraft.time = null;
    timeChips.forEach(x => x.classList.remove("selected"));
    checkReady();
  }));
  timeChips.forEach(c => c.addEventListener("click", () => {
    const bookedHere = existingBookings.some(bk =>
      bk.date === bookingDraft.date && bk.time === c.dataset.time &&
      bk.status !== "declined" && bk.status !== "cancelled"
    );
    if (bookedHere) return; // slot taken
    timeChips.forEach(x => x.classList.remove("selected"));
    c.classList.add("selected");
    bookingDraft.time = c.dataset.time;
    checkReady();
  }));

  continueBtn.addEventListener("click", () => openPayment(bizId));
}

/* Step 3: payment (mock — no real card processing) */
function openPayment(bizId) {
  const biz = kbBusinesses.find(b => b.id === bizId);
  const service = biz.services.find(s => s.id === bookingDraft.serviceId);
  const cust = currentCustomer;

  openModal(`
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <div class="biz-cat">${biz.category}</div>
    <h2>Pay for your booking</h2>

    <div class="pay-summary">
      <div>${service.name} · ${biz.name}</div>
      <div>📍 ${biz.location}</div>
      <div>${kbFormatDate(bookingDraft.date)} at ${bookingDraft.time}</div>
      <div class="pay-total"><span>Total</span><span>${kbFormatCurrency(service.price)}</span></div>
    </div>

    <label class="field-label" style="margin-top:0;">Name on card</label>
    <input class="field-input" id="payName" value="${cust.name}">

    <label class="field-label">Card number</label>
    <input class="field-input" id="payCard" placeholder="4242 4242 4242 4242" maxlength="19">

    <div class="pay-row">
      <div style="flex:1;">
        <label class="field-label">Expiry</label>
        <input class="field-input" id="payExpiry" placeholder="MM/YY" maxlength="5">
      </div>
      <div style="flex:1;">
        <label class="field-label">CVV</label>
        <input class="field-input" id="payCvv" placeholder="123" maxlength="3">
      </div>
    </div>

    <div class="error-msg" id="payError">Please fill in your card details.</div>

    <button class="btn btn-orange btn-block" style="margin-top:22px;" id="payBtn">Pay ${kbFormatCurrency(service.price)} & confirm booking</button>
    <p style="font-size:11.5px;color:rgba(32,27,15,0.5);text-align:center;margin-top:10px;">Demo payment — no real card is charged.</p>
  `);

  modalContent.querySelector("#payBtn").addEventListener("click", () => {
    const name = modalContent.querySelector("#payName").value.trim();
    const card = modalContent.querySelector("#payCard").value.replace(/\s/g, "");
    const expiry = modalContent.querySelector("#payExpiry").value.trim();
    const cvv = modalContent.querySelector("#payCvv").value.trim();
    const errBox = modalContent.querySelector("#payError");

    if (!name || card.length < 12 || !expiry || cvv.length < 3) {
      errBox.textContent = "Please check your card details and try again.";
      errBox.style.display = "block";
      return;
    }
    finalizeBooking(bizId, service);
  });
}

async function finalizeBooking(bizId, service) {
  const errBox = modalContent.querySelector("#payError");
  const payBtn = modalContent.querySelector("#payBtn");
  payBtn.disabled = true;
  try {
    const booking = await KB_API.bookings.create({
      businessId: bizId,
      serviceId: service.id,
      customerId: currentCustomer.id,
      date: bookingDraft.date,
      time: bookingDraft.time
    });
    openConfirmation(bizId, service, booking);
  } catch (e) {
    errBox.textContent = e.message;
    errBox.style.display = "block";
    payBtn.disabled = false;
  }
}

/* Step 4: confirmation */
function openConfirmation(bizId, service, booking) {
  const biz = kbBusinesses.find(b => b.id === bizId);
  openModal(`
    <button class="modal-close" onclick="closeModal(); renderAuthState();">&times;</button>
    <div class="confirm-box">
      <div class="check">✓</div>
      <h2>Payment successful</h2>
      <p style="font-size:14px;color:rgba(32,27,15,0.65);margin:10px 0 4px;">
        Your <strong>${service.name}</strong> with <strong>${biz.name}</strong> is booked and confirmed for <strong>${kbFormatDate(booking.date)}</strong> at <strong>${booking.time}</strong>.
      </p>
      <p style="font-size:13px;font-weight:600;color:var(--green-deep);margin:0 0 4px;">📍 ${biz.location}</p>
      <div class="ref-box">Reference: ${booking.paymentRef} · ${kbFormatCurrency(booking.amountPaid)} paid</div>
      <button class="btn btn-orange btn-block" style="margin-top:20px;" onclick="closeModal(); showBookingsTab();">View my bookings</button>
    </div>
  `);
}

function showBookingsTab() {
  custTabRow.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
  custTabRow.querySelector('[data-tab="bookings"]').classList.add("active");
  browseTab.style.display = "none";
  bookingsTab.style.display = "block";
  renderBookingsTab();
}

renderAuthState();
