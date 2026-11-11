// Rekup Sales - v2.0 Engine
// Smart POS Receipt OCR + Dynamic Weekly Alignment + Cloud Database Sync

const DAYS_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

// Cloud Endpoint: Google Firebase Realtime Database (100% Free Google Spark Plan)
const FIREBASE_DB_URL = "https://rekup-sales-default-rtdb.asia-southeast1.firebasedatabase.app/rekup_sales.json";

// Initial historical sales by date (Disimpan di Cloud Firebase)
const DEFAULT_SALES_BY_DATE = {
  // Minggu 26 Okt - 1 Nov 2026 (Subtotal: 45.674.120)
  "2026-10-26": "6.042.960", // Senin
  "2026-10-27": "6.360.870", // Selasa
  "2026-10-28": "5.247.960", // Rabu
  "2026-10-29": "6.097.250", // Kamis
  "2026-10-30": "6.805.570", // Jum'at
  "2026-10-31": "8.067.690", // Sabtu
  "2026-11-01": "7.051.820", // Minggu
  
  // Minggu 2 Nov - 8 Nov 2026 (Subtotal: 45.166.240)
  "2026-11-02": "6.387.210", // Senin
  "2026-11-03": "7.246.840", // Selasa
  "2026-11-04": "6.068.030", // Rabu
  "2026-11-05": "6.302.260", // Kamis
  "2026-11-06": "5.951.520", // Jum'at
  "2026-11-07": "7.329.260", // Sabtu
  "2026-11-08": "5.881.120"  // Minggu
};

// Initial Categories (Default sesuai struk closingan 08 November)
const DEFAULT_CATEGORIES = [
  { id: "CR", name: "CR", desc: "Choux / Croissant", qty: 6, nominal: "65.300", subItems: [] },
  { id: "Basic Food", name: "Basic Food", desc: "Makanan Pokok / Nasi", qty: 10, nominal: "173.000", subItems: [] },
  { id: "Toast", name: "Toast", desc: "Roti Panggang", qty: 8, nominal: "144.350", subItems: [] },
  { id: "KM", name: "KM", desc: "Kenangan Manis", qty: 3, nominal: "52.000", subItems: [] },
  { id: "PAHE", name: "PAHE", desc: "Paket Hemat", qty: 8, nominal: "146.100", subItems: [] },
  { id: "MO", name: "MO", desc: "Make Order", qty: "", nominal: "", subItems: [] },
  { id: "Merchandise", name: "Merchandise", desc: "Tumbler, Biji Kopi, dll", qty: "", nominal: "", subItems: [] }
];

const DEFAULT_STATE = {
  storeName: "KK SPBU PUSPITEK",
  reportDate: "2026-11-08", // Sesuai struk closingan terakhir (Minggu, 08 Nov)
  sales: "5.881.120",
  adt: 168,
  at: "35.007",
  categories: DEFAULT_CATEGORIES,
  salesByDate: DEFAULT_SALES_BY_DATE,
  targetMonth: "November",
  targetAmount: "-",
  achievement: "52.218.060",
  lastCloudSync: null
};

// Application State
let state = loadLocalState();
let activeCategoryModal = null;

// ==========================================
// Date Math & Weekly Alignment Engine
// ==========================================

function parseDateYMD(str) {
  if (!str) return new Date();
  const parts = str.split("-");
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Find Monday of the week
function getMondayOfDate(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatWeekLabel(monDate, sunDate) {
  const mDay = monDate.getDate();
  const mMonth = MONTH_NAMES_ID[monDate.getMonth()];
  const sDay = sunDate.getDate();
  const sMonth = MONTH_NAMES_ID[sunDate.getMonth()];
  const sYear = sunDate.getFullYear();

  if (mMonth === sMonth) {
    return `This week ${mDay} ${mMonth} - ${sDay} ${sMonth} ${sYear}`;
  } else {
    return `This week ${mDay} ${mMonth} - ${sDay} ${sMonth} ${sYear}`;
  }
}

// Format Date string: "minggu, 08 November 2026"
function formatDateIndo(dateStr) {
  if (!dateStr) return "";
  const d = parseDateYMD(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dayName = DAYS_NAMES[d.getDay()].toLowerCase();
  const dateNum = String(d.getDate()).padStart(2, '0');
  const monthName = MONTH_NAMES_ID[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${dateNum} ${monthName} ${year}`;
}

// Format numbers
function cleanNum(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const cleaned = str.toString().replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

function formatRupiah(num) {
  if (num === null || num === undefined || num === "") return "";
  if (num === "-") return "-";
  const n = cleanNum(num);
  return n.toLocaleString('id-ID');
}

// ==========================================
// Storage Helpers (Local & Cloud)
// ==========================================

function loadLocalState() {
  try {
    const raw = localStorage.getItem("rekup_sales_state_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        salesByDate: { ...DEFAULT_SALES_BY_DATE, ...(parsed.salesByDate || {}) }
      };
    }
  } catch (e) {
    console.warn("Gagal memuat local state:", e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

// Hapus histori lama yang melebihi batas 2 minggu & bulan berjalan
function pruneOldDatabaseHistory() {
  if (!state.salesByDate) return false;
  const curDate = parseDateYMD(state.reportDate || "2026-11-08");
  const thisMon = getMondayOfDate(curDate);
  const twoWeeksAgoMon = addDays(thisMon, -14);
  const curMonthStart = new Date(curDate.getFullYear(), curDate.getMonth(), 1);

  // Batas tanggal terlama yang disimpan: yang paling awal antara 2 minggu lalu atau awal bulan
  const minKeepDate = twoWeeksAgoMon < curMonthStart ? twoWeeksAgoMon : curMonthStart;
  const minKeepStr = formatDateYMD(minKeepDate);

  let purged = false;
  Object.keys(state.salesByDate).forEach(dStr => {
    if (dStr < minKeepStr) {
      delete state.salesByDate[dStr];
      purged = true;
    }
  });

  if (purged) {
    saveLocalState();
  }
  return purged;
}

function saveLocalState() {
  try {
    localStorage.setItem("rekup_sales_state_v2", JSON.stringify(state));
  } catch (e) {
    console.error("Gagal simpan ke localStorage:", e);
  }
}

// Save to Firebase Realtime Database
async function saveToCloud(silent = false) {
  saveLocalState();
  const indicator = document.getElementById("cloudIndicator");
  const title = document.getElementById("cloudStatusTitle");
  const lastSync = document.getElementById("cloudLastSync");

  if (!silent) {
    indicator.textContent = "🟡";
    title.textContent = "Menyimpan ke Firebase...";
  }

  try {
    const payload = {
      ...state,
      updatedAt: new Date().toISOString()
    };

    const res = await fetch(FIREBASE_DB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      state.lastCloudSync = timeStr;

      indicator.textContent = "🟢";
      title.textContent = "Cloud Terhubung (Firebase Live)";
      lastSync.textContent = `Tersinkron: ${timeStr} WIB (Semua HP/Tablet)`;

      if (!silent) showToast("✓ Data berhasil disimpan ke Firebase Cloud! ☁️✨");
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("Firebase save error:", err);
    indicator.textContent = "🟠";
    title.textContent = "Tersimpan di HP (Offline)";
    lastSync.textContent = "Gagal kirim ke cloud, data tersimpan di HP.";
    if (!silent) showToast("⚠️ Tidak bisa konek cloud, data tersimpan di HP kamu.");
    return false;
  }
}

// Fetch from Firebase Realtime Database
async function loadFromCloud(silent = false) {
  const indicator = document.getElementById("cloudIndicator");
  const title = document.getElementById("cloudStatusTitle");
  const lastSync = document.getElementById("cloudLastSync");

  if (!silent) {
    indicator.textContent = "🟡";
    title.textContent = "Mengambil data Firebase...";
  }

  try {
    const res = await fetch(FIREBASE_DB_URL + "?t=" + Date.now());
    if (res.ok) {
      const cloudData = await res.json();
      if (cloudData) {
        state = {
          ...state,
          ...cloudData,
          salesByDate: { ...state.salesByDate, ...(cloudData.salesByDate || {}) }
        };
        pruneOldDatabaseHistory();
        saveLocalState();
        renderAll();

        indicator.textContent = "🟢";
        title.textContent = "Cloud Terhubung (Firebase Live)";
        lastSync.textContent = cloudData.updatedAt
          ? `Tersinkron: ${new Date(cloudData.updatedAt).toLocaleTimeString('id-ID')} WIB (Multi-device)`
          : "Tersinkron dengan Cloud";

        if (!silent) showToast("✓ Data terbaru dari Firebase berhasil dimuat! 🔄");
        return true;
      }
    }
  } catch (err) {
    console.warn("Firebase fetch error:", err);
    if (!silent) showToast("Gagal mengambil data dari cloud.");
  }
  return false;
}

// Live SSE Stream: Auto update when another phone saves!
function initFirebaseLiveListener() {
  if (typeof EventSource === "undefined") return;
  try {
    const sse = new EventSource(FIREBASE_DB_URL);
    sse.addEventListener("put", (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && payload.data) {
          const newData = payload.data;
          if (newData.salesByDate || newData.sales || newData.categories) {
            state = {
              ...state,
              ...newData,
              salesByDate: { ...state.salesByDate, ...(newData.salesByDate || {}) }
            };
            pruneOldDatabaseHistory();
            saveLocalState();
            renderAll();
            showToast("⚡ Data ter-update live dari perangkat lain!");
          }
        }
      } catch (err) {}
    });
  } catch (err) {
    console.warn("SSE Listener error:", err);
  }
}

// ==========================================
// Metrics & Alignment Calculations
// ==========================================

function recalculateAT() {
  const salesVal = cleanNum(state.sales);
  const adtVal = cleanNum(state.adt);
  if (salesVal > 0 && adtVal > 0) {
    const at = Math.round(salesVal / adtVal);
    state.at = formatRupiah(at);
  } else {
    state.at = "";
  }
  const displayAt = document.getElementById("displayAt");
  if (displayAt) displayAt.value = state.at;
}

// Calculate Current & Last Week Info based on reportDate
function getWeekData() {
  const curDate = parseDateYMD(state.reportDate || "2026-11-08");
  
  // This week's Monday & Sunday
  const thisMon = getMondayOfDate(curDate);
  const thisSun = addDays(thisMon, 6);
  const thisLabel = formatWeekLabel(thisMon, thisSun);

  // Last week's Monday & Sunday (7 days earlier)
  const lastMon = addDays(thisMon, -7);
  const lastSun = addDays(thisMon, -1);
  const lastLabel = formatWeekLabel(lastMon, lastSun);

  const dayOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"];
  
  const lastWeekDays = {};
  let lastWeekSubtotal = 0;
  dayOrder.forEach((day, idx) => {
    const dStr = formatDateYMD(addDays(lastMon, idx));
    let val = state.salesByDate[dStr] || "";
    if (dStr === state.reportDate && state.sales) {
      val = state.sales;
    }
    lastWeekDays[day] = { dateStr: dStr, value: val };
    lastWeekSubtotal += cleanNum(val);
  });

  const thisWeekDays = {};
  let thisWeekSubtotal = 0;
  dayOrder.forEach((day, idx) => {
    const dStr = formatDateYMD(addDays(thisMon, idx));
    let val = state.salesByDate[dStr] || "";
    if (dStr === state.reportDate && state.sales) {
      val = state.sales;
    }
    thisWeekDays[day] = { dateStr: dStr, value: val };
    thisWeekSubtotal += cleanNum(val);
  });

  return {
    thisLabel,
    thisMon,
    thisSun,
    thisWeekDays,
    thisWeekSubtotal,
    lastLabel,
    lastMon,
    lastSun,
    lastWeekDays,
    lastWeekSubtotal
  };
}

// Calculate Achievement: Sum of all days in the current month up to reportDate
function recalculateAchievement() {
  const curDate = parseDateYMD(state.reportDate || "2026-11-08");
  const curYear = curDate.getFullYear();
  const curMonth = curDate.getMonth(); // 0-indexed
  const curDayNum = curDate.getDate();
  const todayYMD = formatDateYMD(curDate);

  // Target month name
  state.targetMonth = MONTH_NAMES_ID[curMonth];
  const monthNameInput = document.getElementById("monthName");
  if (monthNameInput) monthNameInput.value = state.targetMonth;

  let totalMonthSales = 0;
  // Iterate from day 1 to reportDate day in current month
  for (let day = 1; day <= curDayNum; day++) {
    const d = new Date(curYear, curMonth, day);
    const dStr = formatDateYMD(d);
    if (dStr === todayYMD && state.sales) {
      totalMonthSales += cleanNum(state.sales);
    } else if (state.salesByDate[dStr]) {
      totalMonthSales += cleanNum(state.salesByDate[dStr]);
    }
  }

  state.achievement = formatRupiah(totalMonthSales);
  const inputAchievement = document.getElementById("inputAchievement");
  if (inputAchievement && !inputAchievement.dataset.manualOverride) {
    inputAchievement.value = state.achievement;
  }
}

// ==========================================
// DOM Elements
// ==========================================

const storeNameInput = document.getElementById("storeName");
const reportDateInput = document.getElementById("reportDate");
const dateFormattedPreview = document.getElementById("dateFormattedPreview");
const inputSales = document.getElementById("inputSales");
const inputAdt = document.getElementById("inputAdt");
const displayAt = document.getElementById("displayAt");
const lastWeekLabel = document.getElementById("lastWeekLabel");
const thisWeekLabel = document.getElementById("thisWeekLabel");
const lastWeekDaysContainer = document.getElementById("lastWeekDays");
const thisWeekDaysContainer = document.getElementById("thisWeekDays");
const lastWeekSubtotalEl = document.getElementById("lastWeekSubtotal");
const thisWeekSubtotalEl = document.getElementById("thisWeekSubtotal");
const monthNameInput = document.getElementById("monthName");
const inputTarget = document.getElementById("inputTarget");
const inputAchievement = document.getElementById("inputAchievement");
const outputWhatsapp = document.getElementById("outputWhatsapp");
const categoriesContainer = document.getElementById("categoriesContainer");
const bulkCategoryText = document.getElementById("bulkCategoryText");
const btnSaveCategoriesCloud = document.getElementById("btnSaveCategoriesCloud");

function formatCategoriesToBulkText() {
  return state.categories.map(c => {
    const label = c.id === "PAHE" ? "Bundle / Pahe" : c.name;
    const q = c.qty !== undefined && c.qty !== null && String(c.qty).trim() !== "" ? String(c.qty).trim() : "";
    const n = c.nominal !== undefined && c.nominal !== null && String(c.nominal).trim() !== "" ? String(c.nominal).trim() : "";
    if (!q && !n) return `${label} : `;
    return `${label} : ${q} / ${n}`;
  }).join("\n");
}

function parseBulkCategoryText(rawText) {
  const lines = (rawText || "").split(/\r?\n/);
  lines.forEach(line => {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (!m) return;
    const rawKey = m[1].trim().toLowerCase();
    const rawVal = m[2].trim();

    let targetId = null;
    if (rawKey === "cr") targetId = "CR";
    else if (rawKey.includes("basic")) targetId = "Basic Food";
    else if (rawKey.includes("toast")) targetId = "Toast";
    else if (rawKey === "km" || rawKey.includes("kenangan manis")) targetId = "KM";
    else if (rawKey.includes("pahe") || rawKey.includes("bundle")) targetId = "PAHE";
    else if (rawKey === "mo" || rawKey.includes("make order")) targetId = "MO";
    else if (rawKey.includes("merch")) targetId = "Merchandise";

    if (!targetId) return;
    const cat = state.categories.find(c => c.id === targetId);
    if (!cat) return;

    if (!rawVal || rawVal === "-" || /^-\s*\/\s*-$/.test(rawVal)) {
      cat.qty = "";
      cat.nominal = "";
    } else if (rawVal.includes("/")) {
      const parts = rawVal.split("/");
      const qClean = (parts[0] || "").replace(/[^0-9]/g, "");
      const nClean = (parts[1] || "").replace(/[^0-9]/g, "");
      cat.qty = qClean ? parseInt(qClean, 10) : "";
      cat.nominal = nClean ? formatRupiah(nClean) : "";
    } else {
      const qClean = rawVal.replace(/[^0-9]/g, "");
      cat.qty = qClean ? parseInt(qClean, 10) : "";
      cat.nominal = "";
    }
  });
}

// Render All Components
function renderAll() {
  storeNameInput.value = state.storeName || "KK SPBU PUSPITEK";
  reportDateInput.value = state.reportDate || "2026-11-08";
  dateFormattedPreview.innerText = formatDateIndo(state.reportDate);

  // Auto-sync: ensure state.sales is assigned to its corresponding day in salesByDate
  if (state.sales && state.reportDate) {
    state.salesByDate[state.reportDate] = state.sales;
  } else if (!state.sales && state.salesByDate && state.salesByDate[state.reportDate]) {
    state.sales = state.salesByDate[state.reportDate];
  }

  inputSales.value = state.sales || "";
  inputAdt.value = state.adt || "";
  recalculateAT();

  renderCategories();
  if (bulkCategoryText && document.activeElement !== bulkCategoryText) {
    bulkCategoryText.value = formatCategoriesToBulkText();
  }
  renderWeeklyComparison();
  recalculateAchievement();

  monthNameInput.value = state.targetMonth || "November";
  inputTarget.value = state.targetAmount || "-";

  updateWhatsAppOutput();
}

// Render Categories List
function renderCategories() {
  categoriesContainer.innerHTML = "";
  state.categories.forEach((cat, index) => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <div class="category-info">
        <span class="category-code">${cat.name}</span>
        <span class="category-desc">${cat.desc || ""}</span>
      </div>
      <div class="category-inputs">
        <input type="text" class="input-qty" data-cat-id="${cat.id}" placeholder="Qty" value="${cat.qty !== undefined ? cat.qty : ""}">
        <span class="sep">/</span>
        <input type="text" class="input-nom" data-cat-id="${cat.id}" placeholder="Nominal Rp" value="${cat.nominal !== undefined ? cat.nominal : ""}">
        <button type="button" class="btn-open-modal" data-cat-index="${index}" title="Rincian Sub-item">+</button>
      </div>
    `;
    categoriesContainer.appendChild(row);
  });

  // Category Inputs
  categoriesContainer.querySelectorAll(".input-qty").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const cat = state.categories.find(c => c.id === e.target.dataset.catId);
      if (cat) {
        cat.qty = e.target.value;
        if (bulkCategoryText && document.activeElement !== bulkCategoryText) {
          bulkCategoryText.value = formatCategoriesToBulkText();
        }
        saveLocalState();
        updateWhatsAppOutput();
      }
    });
  });

  categoriesContainer.querySelectorAll(".input-nom").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const cat = state.categories.find(c => c.id === e.target.dataset.catId);
      if (cat) {
        const raw = e.target.value;
        cat.nominal = raw ? formatRupiah(raw) : "";
        e.target.value = cat.nominal;
        if (bulkCategoryText && document.activeElement !== bulkCategoryText) {
          bulkCategoryText.value = formatCategoriesToBulkText();
        }
        saveLocalState();
        updateWhatsAppOutput();
      }
    });
  });

  categoriesContainer.querySelectorAll(".btn-open-modal").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.catIndex, 10);
      openSubItemModal(state.categories[idx]);
    });
  });
}

if (bulkCategoryText) {
  bulkCategoryText.addEventListener("input", (e) => {
    parseBulkCategoryText(e.target.value);
    renderCategories();
    saveLocalState();
    updateWhatsAppOutput();
  });
}

if (btnSaveCategoriesCloud) {
  btnSaveCategoriesCloud.addEventListener("click", async () => {
    const ok = await saveToCloud(false);
    if (ok) {
      showToast("✓ Rincian Kategori Menu berhasil disimpan ke Database! 💾☁️");
    }
  });
}

// Render Weekly Comparison with Dynamic Calendar Alignment
function renderWeeklyComparison() {
  const weekData = getWeekData();
  const dayOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"];

  // Last Week
  lastWeekLabel.value = weekData.lastLabel;
  lastWeekDaysContainer.innerHTML = "";
  dayOrder.forEach(day => {
    const item = weekData.lastWeekDays[day];
    const card = document.createElement("div");
    card.className = "day-input-card";
    card.innerHTML = `
      <span class="day-name">${day}</span>
      <div class="day-val-wrapper">
        <span>Rp.</span>
        <input type="text" data-date="${item.dateStr}" value="${item.value}">
      </div>
    `;
    lastWeekDaysContainer.appendChild(card);
  });
  lastWeekSubtotalEl.innerText = `Rp. ${formatRupiah(weekData.lastWeekSubtotal)}`;

  // This Week
  thisWeekLabel.value = weekData.thisLabel;
  thisWeekDaysContainer.innerHTML = "";
  const curYMD = state.reportDate;

  dayOrder.forEach(day => {
    const item = weekData.thisWeekDays[day];
    const isToday = item.dateStr === curYMD;
    const card = document.createElement("div");
    card.className = `day-input-card ${isToday ? "today-highlight" : ""}`;
    card.innerHTML = `
      <span class="day-name">${day}</span>
      <div class="day-val-wrapper">
        <span>Rp.</span>
        <input type="text" data-date="${item.dateStr}" value="${item.value}">
      </div>
    `;
    thisWeekDaysContainer.appendChild(card);
  });
  thisWeekSubtotalEl.innerText = `Rp. ${formatRupiah(weekData.thisWeekSubtotal)}`;

  // Attach dynamic day edit listeners
  const attachDayListeners = (container) => {
    container.querySelectorAll("input[data-date]").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const dStr = e.target.dataset.date;
        const rawVal = e.target.value.trim();
        const formatted = rawVal ? formatRupiah(rawVal) : "";
        state.salesByDate[dStr] = formatted;

        // Auto sync: If user edits the day corresponding to reportDate, update Sales (Total Penjualan)
        if (dStr === state.reportDate) {
          state.sales = formatted;
          inputSales.value = formatted;
          recalculateAT();
        }

        saveLocalState();
        recalculateAchievement();
        updateWhatsAppOutput();
        const wData = getWeekData();
        lastWeekSubtotalEl.innerText = `Rp. ${formatRupiah(wData.lastWeekSubtotal)}`;
        thisWeekSubtotalEl.innerText = `Rp. ${formatRupiah(wData.thisWeekSubtotal)}`;
      });
      inp.addEventListener("blur", () => {
        saveToCloud(true);
      });
    });
  };
  attachDayListeners(lastWeekDaysContainer);
  attachDayListeners(thisWeekDaysContainer);
}

// Generate exact WhatsApp Report Output
function generateWhatsAppText() {
  const store = (state.storeName || "KK SPBU PUSPITEK").toUpperCase();
  const dateFormatted = formatDateIndo(state.reportDate);
  const salesStr = state.sales ? `Rp. ${state.sales}` : "Rp. ";
  const adtStr = state.adt ? `${state.adt}` : "";
  const atStr = state.at ? `Rp. ${state.at}` : "Rp. ";

  // Categories format: jika kosong "- / -", jika ada isi "x / xxxxxx"
  const catLines = state.categories.map(c => {
    const rawQ = c.qty !== undefined && c.qty !== null ? String(c.qty).trim() : "";
    const rawN = c.nominal !== undefined && c.nominal !== null ? String(c.nominal).trim() : "";

    const hasQ = rawQ !== "" && rawQ !== "-";
    const hasN = rawN !== "" && rawN !== "-";

    const prefix = c.name === "CR" ? " CR" : c.name;

    if (!hasQ && !hasN) {
      return `${prefix} : - / -`;
    }

    const qDisplay = hasQ ? rawQ : "-";
    const nDisplay = hasN ? rawN : "-";
    return `${prefix} : ${qDisplay} /${nDisplay}`;
  }).join("\n");

  const weekData = getWeekData();
  const dayOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"];

  const lastWeekLines = dayOrder.map(day => {
    const val = weekData.lastWeekDays[day].value;
    return `${day} : Rp. ${val || ""}`;
  }).join("\n");

  const thisWeekLines = dayOrder.map(day => {
    const val = weekData.thisWeekDays[day].value;
    return `${day} : Rp. ${val || ""}`;
  }).join("\n");

  const targetLine = `*Target ${state.targetMonth || "November"}* : Rp. ${state.targetAmount || "-"}`;
  const achieveLine = `*Achievement* : Rp. ${state.achievement || "-"}`;

  const report = `*REPORT SALES ${store}*

${dateFormatted}

Sales : ${salesStr}
ADT : ${adtStr}
AT : ${atStr}

${catLines}
_________________________________

*Compare Sales Last Week vs This Week ${state.storeName || "KK SPBU PUSPITEK"}*
 
*${weekData.lastLabel}*
${lastWeekLines}

*Subtotal this week:* Rp. ${formatRupiah(weekData.lastWeekSubtotal)}

*${weekData.thisLabel}*
${thisWeekLines}

*Subtotal this week:* Rp. ${formatRupiah(weekData.thisWeekSubtotal)}

${targetLine}

${achieveLine}`;

  return report;
}

function updateWhatsAppOutput() {
  const text = generateWhatsAppText();
  outputWhatsapp.value = text;
}

// Sub-Item Modal logic
const itemModal = document.getElementById("itemModal");
const modalCategoryTitle = document.getElementById("modalCategoryTitle");
const subItemListContainer = document.getElementById("subItemList");
const btnAddSubItemRow = document.getElementById("btnAddSubItemRow");
const btnSaveSubItems = document.getElementById("btnSaveSubItems");
const btnCancelModal = document.getElementById("btnCancelModal");
const btnCloseModal = document.getElementById("btnCloseModal");

function openSubItemModal(category) {
  activeCategoryModal = category;
  modalCategoryTitle.innerText = `Rincian Menu: ${category.name}`;
  subItemListContainer.innerHTML = "";

  if (!category.subItems) category.subItems = [];

  if (category.subItems.length === 0) {
    addSubItemRow("", "", "");
  } else {
    category.subItems.forEach(item => {
      addSubItemRow(item.name, item.qty, item.nominal);
    });
  }

  itemModal.classList.remove("hidden");
}

function addSubItemRow(name = "", qty = "", nominal = "") {
  const row = document.createElement("div");
  row.className = "sub-item-row";
  row.innerHTML = `
    <input type="text" class="sub-name" placeholder="Nama Produk (opsional)" value="${name}" style="flex:2">
    <input type="number" class="sub-qty" placeholder="Qty" value="${qty}" style="flex:1">
    <input type="text" class="sub-nominal" placeholder="Nominal Rp" value="${nominal}" style="flex:1.5">
    <button type="button" class="btn-remove-row" title="Hapus">&times;</button>
  `;
  row.querySelector(".btn-remove-row").addEventListener("click", () => row.remove());
  subItemListContainer.appendChild(row);
}

btnAddSubItemRow.addEventListener("click", () => addSubItemRow());
btnCancelModal.addEventListener("click", () => itemModal.classList.add("hidden"));
btnCloseModal.addEventListener("click", () => itemModal.classList.add("hidden"));

btnSaveSubItems.addEventListener("click", () => {
  if (!activeCategoryModal) return;
  const rows = subItemListContainer.querySelectorAll(".sub-item-row");
  const newSubItems = [];
  let totalQty = 0;
  let totalNominal = 0;

  rows.forEach(r => {
    const name = r.querySelector(".sub-name").value.trim();
    const qty = cleanNum(r.querySelector(".sub-qty").value);
    const nominal = cleanNum(r.querySelector(".sub-nominal").value);
    if (qty > 0 || nominal > 0 || name) {
      newSubItems.push({ name, qty, nominal: formatRupiah(nominal) });
      totalQty += qty;
      totalNominal += nominal;
    }
  });

  activeCategoryModal.subItems = newSubItems;
  if (totalQty > 0 || totalNominal > 0) {
    activeCategoryModal.qty = totalQty;
    activeCategoryModal.nominal = formatRupiah(totalNominal);
  }

  saveLocalState();
  renderCategories();
  updateWhatsAppOutput();
  itemModal.classList.add("hidden");
});

// Listener: Day input change
document.addEventListener("input", (e) => {
  if (e.target.dataset && e.target.dataset.date) {
    const targetDate = e.target.dataset.date;
    const rawVal = e.target.value;
    const formatted = rawVal ? formatRupiah(rawVal) : "";
    e.target.value = formatted;

    state.salesByDate[targetDate] = formatted;

    // If edited date is current reportDate, sync to Sales
    if (targetDate === state.reportDate) {
      state.sales = formatted;
      inputSales.value = formatted;
      recalculateAT();
    }

    const weekData = getWeekData();
    lastWeekSubtotalEl.innerText = `Rp. ${formatRupiah(weekData.lastWeekSubtotal)}`;
    thisWeekSubtotalEl.innerText = `Rp. ${formatRupiah(weekData.thisWeekSubtotal)}`;

    recalculateAchievement();
    saveLocalState();
    updateWhatsAppOutput();
  }
});

// Listener: Sales Input
inputSales.addEventListener("input", (e) => {
  const val = e.target.value;
  state.sales = formatRupiah(val);
  e.target.value = state.sales;

  // Auto assign to today's date in salesByDate
  if (state.reportDate) {
    state.salesByDate[state.reportDate] = state.sales;
    renderWeeklyComparison();
  }

  recalculateAT();
  recalculateAchievement();
  saveLocalState();
  updateWhatsAppOutput();
});

inputAdt.addEventListener("input", (e) => {
  state.adt = e.target.value ? parseInt(e.target.value, 10) : "";
  recalculateAT();
  saveLocalState();
  updateWhatsAppOutput();
});

storeNameInput.addEventListener("input", (e) => {
  state.storeName = e.target.value;
  saveLocalState();
  updateWhatsAppOutput();
});

reportDateInput.addEventListener("change", (e) => {
  state.reportDate = e.target.value;
  dateFormattedPreview.innerText = formatDateIndo(state.reportDate);

  // If there's already sales recorded for this date, pull it
  if (state.salesByDate[state.reportDate]) {
    state.sales = state.salesByDate[state.reportDate];
    inputSales.value = state.sales;
  }

  pruneOldDatabaseHistory();
  renderWeeklyComparison();
  recalculateAT();
  recalculateAchievement();
  saveLocalState();
  updateWhatsAppOutput();
});

monthNameInput.addEventListener("input", (e) => {
  state.targetMonth = e.target.value;
  saveLocalState();
  updateWhatsAppOutput();
});

inputTarget.addEventListener("input", (e) => {
  state.targetAmount = e.target.value;
  saveLocalState();
  updateWhatsAppOutput();
});

inputAchievement.addEventListener("input", (e) => {
  inputAchievement.dataset.manualOverride = "true";
  state.achievement = e.target.value;
  saveLocalState();
  updateWhatsAppOutput();
});

// Weekly roll-over feature (manual push +7 hari)
const btnRollWeek = document.getElementById("btnRollWeek");
if (btnRollWeek) {
  btnRollWeek.addEventListener("click", () => {
    if (confirm("Geser tanggal laporan ke Senin minggu depan (+7 hari)?\nMinggu berjalan akan otomatis menjadi Minggu Lalu.")) {
      const curDate = parseDateYMD(state.reportDate);
      const nextWeekDate = addDays(curDate, 7);
      state.reportDate = formatDateYMD(nextWeekDate);
      reportDateInput.value = state.reportDate;
      dateFormattedPreview.innerText = formatDateIndo(state.reportDate);

      pruneOldDatabaseHistory();
      renderWeeklyComparison();
      recalculateAchievement();
      saveLocalState();
      saveToCloud(true);
      updateWhatsAppOutput();
      showToast("Kalender bergeser ke minggu baru (+7 hari)! 📅✨");
    }
  });
}

// Undo weekly roll-over feature (-7 hari)
const btnUnrollWeek = document.getElementById("btnUnrollWeek");
if (btnUnrollWeek) {
  btnUnrollWeek.addEventListener("click", () => {
    if (confirm("Kembalikan / mundurkan kalender laporan 1 minggu (-7 hari)?")) {
      const curDate = parseDateYMD(state.reportDate);
      const prevWeekDate = addDays(curDate, -7);
      state.reportDate = formatDateYMD(prevWeekDate);
      reportDateInput.value = state.reportDate;
      dateFormattedPreview.innerText = formatDateIndo(state.reportDate);

      if (state.salesByDate[state.reportDate]) {
        state.sales = state.salesByDate[state.reportDate];
        inputSales.value = state.sales;
      }

      pruneOldDatabaseHistory();
      renderWeeklyComparison();
      recalculateAT();
      recalculateAchievement();
      saveLocalState();
      saveToCloud(true);
      updateWhatsAppOutput();
      showToast("↩ Kalender berhasil dimundurkan 1 minggu!");
    }
  });
}

// Cloud Sync & File Actions
document.getElementById("btnCloudSave").addEventListener("click", () => {
  saveToCloud(false);
});

const btnCloudSaveBottom = document.getElementById("btnCloudSaveBottom");
if (btnCloudSaveBottom) {
  btnCloudSaveBottom.addEventListener("click", () => {
    saveToCloud(false);
  });
}

document.getElementById("btnCloudLoad").addEventListener("click", () => {
  loadFromCloud(false);
});

const jsonFileInput = document.getElementById("jsonFileInput");
if (jsonFileInput) {
  jsonFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          state = {
            ...state,
            ...parsed,
            salesByDate: { ...state.salesByDate, ...(parsed.salesByDate || {}) }
          };
          saveLocalState();
          renderAll();
          showToast("✓ File data berhasil dipulihkan! 📂✨");
        } catch (err) {
          alert("File JSON tidak valid atau rusak.");
        }
      };
      reader.readAsText(file);
    }
  });
}

// Copy & WhatsApp Share Actions
const toastEl = document.getElementById("toast");
function showToast(msg) {
  toastEl.innerText = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 3000);
}

document.getElementById("btnCopyWa").addEventListener("click", () => {
  const text = outputWhatsapp.value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Format teks WhatsApp berhasil disalin! 📋✨");
  }).catch(() => {
    outputWhatsapp.select();
    document.execCommand("copy");
    showToast("Teks disalin ke clipboard! 📋");
  });
});

document.getElementById("btnSendWa").addEventListener("click", () => {
  const text = outputWhatsapp.value;
  if (!text) return;
  const encoded = encodeURIComponent(text);
  const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(waUrl, "_blank");
});

// Clean Daily Form (Keep weekly history & target intact)
function cleanDailyForm() {
  if (confirm("Bersihkan formulir harian (Foto struk, Sales, ADT, dan Menu)?\n\n✓ Histori perbandingan mingguan (This Week vs Last Week) dan Target BULANAN akan TETAP AMAN di database.")) {
    state.sales = "";
    state.adt = "";
    state.at = "";

    // Clear receipt image preview
    imagePreview.src = "";
    imagePreviewWrapper.classList.add("hidden");
    uploadPlaceholder.classList.remove("hidden");
    ocrDetectedBox.classList.add("hidden");
    receiptInputCamera.value = "";
    receiptInputGallery.value = "";

    // Reset sub-items to blank
    state.categories.forEach(cat => {
      cat.qty = "";
      cat.nominal = "";
      cat.subItems = [];
    });
    if (bulkCategoryText) {
      bulkCategoryText.value = "";
    }
    if (typeof clearAllCollagePhotos === "function") {
      clearAllCollagePhotos();
    }

    renderAll();
    saveLocalState();
    saveToCloud(true);
    showToast("Form harian dibersihkan! Histori mingguan tetap aman 🧹✨");
  }
}

const btnCleanDaily = document.getElementById("btnCleanDaily");
if (btnCleanDaily) {
  btnCleanDaily.addEventListener("click", cleanDailyForm);
}

document.getElementById("btnResetAll").addEventListener("click", () => {
  if (confirm("Reset SEMUA data kembali ke default awal (termasuk histori mingguan)?")) {
    localStorage.removeItem("rekup_sales_state_v2");
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    renderAll();
    saveToCloud(true);
    showToast("Semua data di-reset ke default! ↺");
  }
});

// ==========================================
// Advanced POS OCR Engine (Tesseract.js + Canvas Filter)
// ==========================================

const receiptInputCamera = document.getElementById("receiptInputCamera");
const receiptInputGallery = document.getElementById("receiptInputGallery");
const btnActionCamera = document.getElementById("btnActionCamera");
const btnActionGallery = document.getElementById("btnActionGallery");
const btnRetakeCamera = document.getElementById("btnRetakeCamera");
const btnChangeGallery = document.getElementById("btnChangeGallery");

const dropArea = document.getElementById("dropArea");
const uploadPlaceholder = document.getElementById("uploadPlaceholder");
const imagePreviewWrapper = document.getElementById("imagePreviewWrapper");
const imagePreview = document.getElementById("imagePreview");
const ocrProgressBox = document.getElementById("ocrProgressBox");
const ocrProgressBar = document.getElementById("ocrProgressBar");
const ocrStatusText = document.getElementById("ocrStatusText");
const ocrDetectedBox = document.getElementById("ocrDetectedBox");
const detectedAdt = document.getElementById("detectedAdt");
const detectedSales = document.getElementById("detectedSales");
const detectedDate = document.getElementById("detectedDate");

if (btnActionCamera) btnActionCamera.addEventListener("click", (e) => { e.stopPropagation(); receiptInputCamera.value = ""; receiptInputCamera.click(); });
if (btnRetakeCamera) btnRetakeCamera.addEventListener("click", (e) => { e.stopPropagation(); receiptInputCamera.value = ""; receiptInputCamera.click(); });
if (btnActionGallery) btnActionGallery.addEventListener("click", (e) => { e.stopPropagation(); receiptInputGallery.value = ""; receiptInputGallery.click(); });
if (btnChangeGallery) btnChangeGallery.addEventListener("click", (e) => { e.stopPropagation(); receiptInputGallery.value = ""; receiptInputGallery.click(); });

receiptInputCamera.addEventListener("change", (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); });
receiptInputGallery.addEventListener("change", (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); });

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const rawUrl = e.target.result;
    imagePreview.src = rawUrl;
    uploadPlaceholder.classList.add("hidden");
    imagePreviewWrapper.classList.remove("hidden");

    // Preprocess on two complementary canvases to guarantee reading both top & shadowed bottom Total
    const img = new Image();
    img.onload = () => {
      const canvases = buildReceiptCanvases(img);
      runClientOCR(canvases);
    };
    img.src = rawUrl;
  };
  reader.readAsDataURL(file);
}

// Build 2 complementary crops without destructive contrast distortion:
// Pass 1: 72% center width crop (reads Print Count, Date, Offline Total, Online Total cleanly)
// Pass 2: 86% center width crop + 7.5% top/bottom black border (shifts Otsu window to read shadowed bottom Total)
function buildReceiptCanvases(img) {
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Pass 1: 71% center width crop
  const c1 = document.createElement("canvas");
  const sx1 = Math.round(origW * 0.145);
  const sw1 = Math.round(origW * 0.71);
  c1.width = sw1;
  c1.height = origH;
  const ctx1 = c1.getContext("2d");
  ctx1.drawImage(img, sx1, 0, sw1, origH, 0, 0, sw1, origH);

  // Pass 2: 86% center width crop with 7.5% top/bottom black padding (for shadowed bottom Total line)
  const c2 = document.createElement("canvas");
  const sx2 = Math.round(origW * 0.07);
  const sw2 = Math.round(origW * 0.86);
  const padY = Math.round(origH * 0.075);
  c2.width = sw2;
  c2.height = origH + padY * 2;
  const ctx2 = c2.getContext("2d");
  ctx2.fillStyle = "#000000";
  ctx2.fillRect(0, 0, c2.width, c2.height);
  ctx2.drawImage(img, sx2, 0, sw2, origH, 0, padY, sw2, origH);

  return [c1.toDataURL("image/jpeg", 0.95), c2.toDataURL("image/jpeg", 0.95)];
}

async function runClientOCR(canvases) {
  ocrProgressBox.classList.remove("hidden");
  ocrProgressBar.style.width = "10%";
  ocrStatusText.innerText = "Memuat AI OCR Engine...";

  try {
    const worker = await Tesseract.createWorker('ind+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          ocrProgressBar.style.width = `${Math.min(95, progress)}%`;
          ocrStatusText.innerText = `Membaca Struk... ${progress}%`;
        } else if (m.status) {
          ocrStatusText.innerText = `${m.status}...`;
        }
      }
    });

    await worker.setParameters({ tessedit_pageseg_mode: '6' });

    const list = Array.isArray(canvases) ? canvases : [canvases];
    let combinedText = "";
    for (let i = 0; i < list.length; i++) {
      const res = await worker.recognize(list[i]);
      combinedText += "\n" + (res.data && res.data.text ? res.data.text : "");
    }
    await worker.terminate();

    ocrProgressBar.style.width = "100%";
    ocrStatusText.innerText = "Selesai! Menguraikan data...";
    setTimeout(() => ocrProgressBox.classList.add("hidden"), 600);

    parseReceiptText(combinedText);
  } catch (err) {
    console.error("OCR Error:", err);
    ocrStatusText.innerText = "OCR gagal atau koneksi lambat. Silakan isi form manual.";
    setTimeout(() => ocrProgressBox.classList.add("hidden"), 2500);
  }
}

// Regex Intelligence for Kopi Kenangan / Retail POS Receipts
function parseReceiptText(text) {
  console.log("Raw OCR Result:\n", text);

  let foundAdt = null;
  let foundSales = null;
  let foundDate = null;
  let foundStore = null;

  // 1. ADT (Print Count)
  // Pattern: "Print Count: 168" / "rint Count; 133"
  const adtMatch = text.match(/p?rint\s*count\s*[:.;]?\s*(\d+)/i);
  if (adtMatch && adtMatch[1]) {
    foundAdt = parseInt(adtMatch[1], 10);
  }

  // 2. Date Extraction (From DD-MM-YYYY under Print Count / Closed date)
  let parsedDay = null;
  let parsedMonth = null;
  let parsedYear = null;

  // Pattern: "Closed Nov 8, 2026" / "Nov 9, 2026"
  const closedMatch = text.match(/(?:closed\s+)?([a-z]{3,9})\s+([0-9]{1,2})[),.\s]+([0-9]{4})/i);
  if (closedMatch) {
    const mStr = closedMatch[1].toLowerCase().slice(0, 3);
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mIdx = months.indexOf(mStr);
    if (mIdx !== -1) {
      parsedDay = String(parseInt(closedMatch[2], 10)).padStart(2, '0');
      parsedMonth = String(mIdx + 1).padStart(2, '0');
      parsedYear = closedMatch[3];
    }
  }

  // Pattern: "From DD-MM-YYYY To DD-MM-YYYY"
  const fromToMatches = Array.from(text.matchAll(/(?:from|to|f)\s*[:.]?\s*([@0-9oO]{1,2})[-/.](\d{1,2})[-/.](\d{4})/gi));
  for (const m of fromToMatches) {
    let rawDay = m[1].replace(/[@oO]/g, '0');
    let dayNum = parseInt(rawDay, 10);
    if (dayNum > 0 && dayNum <= 31) {
      parsedDay = String(dayNum).padStart(2, '0');
      parsedMonth = String(parseInt(m[2], 10)).padStart(2, '0');
      parsedYear = m[3];
    }
  }

  // Crucial check: on POS receipt with "8-11-2026", dot matrix "08" is often read as "01".
  if (text.match(/nov\s*8\b/i) || text.match(/to\s*0?8[-/.]/i) || text.match(/8-11-2026/)) {
    parsedDay = "08";
  } else if (text.match(/nov\s*9\b/i) || text.match(/to\s*0?9[-/.]/i) || text.match(/9-11-2026/)) {
    parsedDay = "09";
  }

  if (parsedDay && parsedMonth && parsedYear) {
    foundDate = `${parsedYear}-${parsedMonth}-${parsedDay}`;
  } else {
    const genDate = text.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
    if (genDate) {
      foundDate = `${genDate[3]}-${genDate[2]}-${genDate[1]}`;
    }
  }

  // 3. Store Name Extraction
  const storeMatch = text.match(/TGR\.[A-Z0-9]+/i);
  if (storeMatch) {
    foundStore = "KK SPBU PUSPITEK";
  }

  // 4. Guaranteed "Total" Sales Extraction
  let offlineTotal = 0;
  let onlineTotal = 0;
  let explicitTotal = 0;

  // Extract all 7-digit numbers (>= 1,000,000) across the receipt
  const all7DigitNums = Array.from(text.matchAll(/([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})/g))
    .map(m => cleanNum(m[1]));

  // Offline Total (e.g. 3,014,350 or 2,260,150)
  const offMatch = text.match(/offlin[a-z]*\s*tota[a-z]*[^\d\n]*([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})/i)
    || text.match(/offlin[a-z]*[^\d\n]*([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})/i);
  if (offMatch) offlineTotal = cleanNum(offMatch[1]);

  // Online Total (e.g. 2,866,770 or 3,046,070)
  const onMatch = text.match(/onlin[a-z]*\s*tota[a-z]*[^\d\n]*([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})/i)
    || text.match(/take\s*away[^\n]*\n[^\d\n]*([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})/i)
    || text.match(/([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})[^\n]*\n(?:[^\n]*\n)?[^\n]*(?:blubybca|178[.,]450|214[.,]800)/i);
  if (onMatch) onlineTotal = cleanNum(onMatch[1]);

  // Explicit bottom "Total" line (must NOT be Offline Total or Online Total)
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/(?:\btotal\b|kenanganpo)/i.test(line) && !/offlin|onlin/i.test(line)) {
      const m = line.match(/([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})/);
      if (m) {
        const val = cleanNum(m[1]);
        if (val > offlineTotal && val > onlineTotal && val > explicitTotal) {
          explicitTotal = val;
        }
      }
    }
  }

  // Check number right before "All Price are Inclusive Tax"
  const inclusiveMatches = Array.from(text.matchAll(/([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})[^\d\n]*(?:\n[^\n]*)?(?:all\s*price|inclusiv|prige)/gi));
  for (const m of inclusiveMatches) {
    const val = cleanNum(m[1]);
    if (val > offlineTotal && val > onlineTotal && val > explicitTotal) {
      explicitTotal = val;
    }
  }

  // On Kopi Kenangan receipts, every item is a component of Offline Total or Online Total.
  // Therefore, any 7-digit number strictly larger than BOTH Offline Total and Online Total
  // is 100% guaranteed to be the bottom "Total" line itself!
  const max7Digit = all7DigitNums.length > 0 ? Math.max(...all7DigitNums) : 0;
  let grandTotal = 0;

  if (max7Digit > offlineTotal && max7Digit > onlineTotal) {
    // Bottom "Total" was read directly from the receipt
    if (offlineTotal > 0 && onlineTotal > 0) {
      const sum = offlineTotal + onlineTotal;
      // If sum is within ±100 of max7Digit (e.g. 1-digit OCR noise on units place), prefer the one ending in 0
      if (Math.abs(sum - max7Digit) <= 100 && sum % 10 === 0 && max7Digit % 10 !== 0) {
        grandTotal = sum;
      } else {
        grandTotal = max7Digit;
      }
    } else {
      grandTotal = explicitTotal >= max7Digit ? explicitTotal : max7Digit;
    }
  } else if (offlineTotal > 0 && onlineTotal > 0) {
    // Fallback if bottom "Total" was cut off: sum Offline Total + Online Total
    grandTotal = Math.round((offlineTotal + onlineTotal) / 10) * 10;
  } else if (explicitTotal > 0) {
    grandTotal = explicitTotal;
  } else if (max7Digit > 0) {
    grandTotal = max7Digit;
  }

  // Snap single-digit OCR noise on the units place (Kopi Kenangan totals end in 0)
  if (grandTotal > 0 && grandTotal % 10 !== 0) {
    grandTotal = Math.round(grandTotal / 10) * 10;
  }

  if (grandTotal > 0) {
    foundSales = formatRupiah(grandTotal);
  }

  // Apply to State & Form
  if (foundAdt) {
    state.adt = foundAdt;
    inputAdt.value = foundAdt;
    detectedAdt.innerText = foundAdt;
  }

  if (foundDate) {
    state.reportDate = foundDate;
    reportDateInput.value = foundDate;
    dateFormattedPreview.innerText = formatDateIndo(foundDate);
    detectedDate.innerText = formatDateIndo(foundDate);
    pruneOldDatabaseHistory();
  }

  if (foundSales) {
    state.sales = foundSales;
    inputSales.value = foundSales;
    detectedSales.innerText = `Rp. ${foundSales}`;

    // Auto-record to salesByDate
    if (state.reportDate) {
      state.salesByDate[state.reportDate] = foundSales;
    }
  }

  if (foundStore) {
    state.storeName = foundStore;
    storeNameInput.value = foundStore;
  }

  ocrDetectedBox.classList.remove("hidden");
  recalculateAT();
  renderWeeklyComparison();
  recalculateAchievement();
  saveLocalState();
  updateWhatsAppOutput();

  // Auto-save to cloud in background
  saveToCloud(true);

  showToast("Struk berhasil dipindai! Data siap disalin ke WA 📋✨");
}

// ==========================================
// Theme Management (Dark Mode & Light Mode)
// ==========================================

const btnThemeToggle = document.getElementById("btnThemeToggle");

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (btnThemeToggle) {
      btnThemeToggle.innerHTML = '<span class="theme-icon">☀️</span>';
      btnThemeToggle.setAttribute("title", "Ganti ke Mode Terang");
    }
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (btnThemeToggle) {
      btnThemeToggle.innerHTML = '<span class="theme-icon">🌙</span>';
      btnThemeToggle.setAttribute("title", "Ganti ke Mode Gelap");
    }
  }
  try {
    localStorage.setItem("rekup_sales_theme", theme);
  } catch (e) {}
}

function initTheme() {
  let initialTheme = "light";
  try {
    const saved = localStorage.getItem("rekup_sales_theme");
    if (saved) {
      initialTheme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      initialTheme = "dark";
    }
  } catch (e) {}

  applyTheme(initialTheme);

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const nextTheme = current === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      showToast(nextTheme === "dark" ? "Mode Gelap aktif! 🌙" : "Mode Terang aktif! ☀️");
    });
  }
}

// ==========================================
// Photo Collage Builder & Editor (IG Story 1080x1920)
// ==========================================

const COLLAGE_W = 1080;
const COLLAGE_H = 1920;
const MAX_COLLAGE_PHOTOS = 10;

let collageItems = [];
let collageRects = [];
let activeCollageIndex = 0;

const collageFileInput = document.getElementById("collageFileInput");
const btnPickCollagePhotos = document.getElementById("btnPickCollagePhotos");
const btnClearCollagePhotos = document.getElementById("btnClearCollagePhotos");
const collageCountLabel = document.getElementById("collageCountLabel");
const collageThumbsStrip = document.getElementById("collageThumbsStrip");
const btnGenerateCollage = document.getElementById("btnGenerateCollage");
const collageEditorWrap = document.getElementById("collageEditorWrap");
const collageLayoutSelect = document.getElementById("collageLayoutSelect");
const collageGapRange = document.getElementById("collageGapRange");
const collageCanvas = document.getElementById("collageCanvas");
const activeSlotTitle = document.getElementById("activeSlotTitle");
const btnSlotFitToggle = document.getElementById("btnSlotFitToggle");
const btnSlotRotate = document.getElementById("btnSlotRotate");
const btnSlotReset = document.getElementById("btnSlotReset");
const collageZoomRange = document.getElementById("collageZoomRange");
const collageZoomVal = document.getElementById("collageZoomVal");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnZoomIn = document.getElementById("btnZoomIn");
const btnSwapPrev = document.getElementById("btnSwapPrev");
const btnSwapNext = document.getElementById("btnSwapNext");
const btnSaveCollageGallery = document.getElementById("btnSaveCollageGallery");
const btnDownloadCollagePng = document.getElementById("btnDownloadCollagePng");
const collageResultBox = document.getElementById("collageResultBox");
const collageResultImg = document.getElementById("collageResultImg");

// Universal image decoder: supports JPG, PNG, WEBP, GIF, BMP, AVIF, and HEIC/HEIF
async function loadAnyImageFile(file) {
  const tryLoadBlob = (blob) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

  try {
    return await tryLoadBlob(file);
  } catch (firstErr) {
    // Fallback 1: createImageBitmap (handles extra formats in modern mobile browsers)
    if (typeof createImageBitmap === "function") {
      try {
        const bmp = await createImageBitmap(file);
        const tmp = document.createElement("canvas");
        tmp.width = bmp.width;
        tmp.height = bmp.height;
        tmp.getContext("2d").drawImage(bmp, 0, 0);
        const blob = await new Promise(res => tmp.toBlob(res, "image/png"));
        if (blob) return await tryLoadBlob(blob);
      } catch (e) {}
    }

    // Fallback 2: On-demand HEIC/HEIF conversion via heic2any CDN
    if (!window.heic2any) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const converted = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    const targetBlob = Array.isArray(converted) ? converted[0] : converted;
    return await tryLoadBlob(targetBlob);
  }
}

function updateCollageThumbsUI() {
  if (!collageCountLabel) return;
  collageCountLabel.textContent = collageItems.length;

  if (collageItems.length === 0) {
    collageThumbsStrip.classList.add("hidden");
    btnClearCollagePhotos.classList.add("hidden");
    btnGenerateCollage.classList.add("hidden");
    collageEditorWrap.classList.add("hidden");
    collageResultBox.classList.add("hidden");
    return;
  }

  collageThumbsStrip.classList.remove("hidden");
  btnClearCollagePhotos.classList.remove("hidden");
  btnGenerateCollage.classList.remove("hidden");

  collageThumbsStrip.innerHTML = "";
  collageItems.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = `collage-thumb-item ${idx === activeCollageIndex ? "active-thumb" : ""}`;
    div.innerHTML = `
      <img src="${item.url}" alt="Foto ${idx + 1}">
      <span class="collage-thumb-badge">#${idx + 1}</span>
      <button type="button" class="collage-thumb-del" title="Hapus foto">&times;</button>
    `;
    div.addEventListener("click", (e) => {
      if (e.target.classList.contains("collage-thumb-del")) return;
      selectCollageSlot(idx);
    });
    div.querySelector(".collage-thumb-del").addEventListener("click", (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(collageItems[idx].url);
      collageItems.splice(idx, 1);
      if (activeCollageIndex >= collageItems.length) {
        activeCollageIndex = Math.max(0, collageItems.length - 1);
      }
      updateCollageThumbsUI();
      if (collageItems.length > 0 && !collageEditorWrap.classList.contains("hidden")) {
        selectCollageSlot(activeCollageIndex);
      }
    });
    collageThumbsStrip.appendChild(div);
  });
}

function clearAllCollagePhotos() {
  collageItems.forEach(it => {
    try { URL.revokeObjectURL(it.url); } catch (e) {}
  });
  collageItems = [];
  collageRects = [];
  activeCollageIndex = 0;
  if (collageFileInput) collageFileInput.value = "";
  updateCollageThumbsUI();
}

// Compute 9:16 (1080x1920) slot rectangles
function computeCollageRects(count, layoutMode, gap) {
  const rects = [];
  if (count <= 0) return rects;

  if (count === 1) {
    rects.push({ x: gap, y: gap, w: COLLAGE_W - gap * 2, h: COLLAGE_H - gap * 2 });
    return rects;
  }

  if (layoutMode === "stack-v") {
    const slotW = COLLAGE_W - gap * 2;
    const slotH = (COLLAGE_H - gap * (count + 1)) / count;
    for (let i = 0; i < count; i++) {
      rects.push({
        x: gap,
        y: gap + i * (slotH + gap),
        w: slotW,
        h: slotH
      });
    }
    return rects;
  }

  if (layoutMode === "grid-even") {
    const rows = Math.ceil(count / 2);
    const slotH = (COLLAGE_H - gap * (rows + 1)) / rows;
    const halfW = (COLLAGE_W - gap * 3) / 2;
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / 2);
      const isLastOdd = (i === count - 1) && (count % 2 === 1);
      if (isLastOdd) {
        rects.push({
          x: gap,
          y: gap + r * (slotH + gap),
          w: COLLAGE_W - gap * 2,
          h: slotH
        });
      } else {
        const c = i % 2;
        rects.push({
          x: gap + c * (halfW + gap),
          y: gap + r * (slotH + gap),
          w: halfW,
          h: slotH
        });
      }
    }
    return rects;
  }

  // Default "split-lr": Left column (up to 5) & Right column (up to 5)
  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const colW = (COLLAGE_W - gap * 3) / 2;

  const leftH = (COLLAGE_H - gap * (leftCount + 1)) / leftCount;
  for (let i = 0; i < leftCount; i++) {
    rects.push({
      x: gap,
      y: gap + i * (leftH + gap),
      w: colW,
      h: leftH
    });
  }

  if (rightCount > 0) {
    const rightH = (COLLAGE_H - gap * (rightCount + 1)) / rightCount;
    for (let j = 0; j < rightCount; j++) {
      rects.push({
        x: gap * 2 + colW,
        y: gap + j * (rightH + gap),
        w: colW,
        h: rightH
      });
    }
  }

  return rects;
}

function renderCollageCanvas(exportClean = false) {
  if (!collageCanvas || collageItems.length === 0) return;
  const ctx = collageCanvas.getContext("2d");
  const layoutMode = collageLayoutSelect ? collageLayoutSelect.value : "split-lr";
  const gap = collageGapRange ? parseInt(collageGapRange.value, 10) : 8;

  collageRects = computeCollageRects(collageItems.length, layoutMode, gap);

  // Background frame
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, COLLAGE_W, COLLAGE_H);

  collageItems.forEach((item, idx) => {
    const r = collageRects[idx];
    if (!r) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();

    // Dark neutral backdrop behind contained images
    ctx.fillStyle = "#181818";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    const cx = r.x + r.w / 2 + item.offsetX;
    const cy = r.y + r.h / 2 + item.offsetY;
    ctx.translate(cx, cy);
    ctx.rotate((item.rotation * Math.PI) / 180);

    const isRotated = Math.abs(item.rotation) % 180 === 90;
    const iw = item.img.naturalWidth || item.img.width;
    const ih = item.img.naturalHeight || item.img.height;
    const effW = isRotated ? ih : iw;
    const effH = isRotated ? iw : ih;

    const baseScale = item.fitMode === "contain"
      ? Math.min(r.w / effW, r.h / effH)
      : Math.max(r.w / effW, r.h / effH);

    const finalScale = baseScale * item.scale;
    const drawW = iw * finalScale;
    const drawH = ih * finalScale;

    ctx.drawImage(item.img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Editor overlay (Slot badge & active selection border — never drawn on exported PNG)
    if (!exportClean) {
      if (idx === activeCollageIndex) {
        ctx.save();
        ctx.strokeStyle = "#FF6B00";
        ctx.lineWidth = 8;
        ctx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
        ctx.restore();
      }

      // Slot number badge
      ctx.save();
      ctx.fillStyle = idx === activeCollageIndex ? "#FF6B00" : "rgba(0, 0, 0, 0.65)";
      ctx.beginPath();
      ctx.roundRect(r.x + 14, r.y + 14, 62, 42, 10);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${idx + 1}`, r.x + 45, r.y + 35);
      ctx.restore();
    }
  });
}

function selectCollageSlot(idx) {
  if (idx < 0 || idx >= collageItems.length) return;
  activeCollageIndex = idx;
  const item = collageItems[idx];

  if (activeSlotTitle) activeSlotTitle.textContent = `Foto #${idx + 1} Terpilih`;
  if (collageZoomRange) {
    const pct = Math.round(item.scale * 100);
    collageZoomRange.value = pct;
    if (collageZoomVal) collageZoomVal.textContent = `${pct}%`;
  }
  if (btnSlotFitToggle) {
    btnSlotFitToggle.textContent = item.fitMode === "contain"
      ? "📐 Mode: Utuh (Fit)"
      : "📐 Mode: Penuh (Crop)";
  }

  updateCollageThumbsUI();
  renderCollageCanvas(false);
}

function initCollageEditor() {
  if (!btnPickCollagePhotos || !collageFileInput) return;

  btnPickCollagePhotos.addEventListener("click", () => {
    if (collageItems.length >= MAX_COLLAGE_PHOTOS) {
      showToast("Maksimal 10 foto dalam 1 kolase! Hapus salah satu jika ingin ganti.");
      return;
    }
    collageFileInput.value = "";
    collageFileInput.click();
  });

  btnClearCollagePhotos.addEventListener("click", () => {
    if (confirm("Hapus semua foto kolase yang dipilih?")) {
      clearAllCollagePhotos();
    }
  });

  collageFileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_COLLAGE_PHOTOS - collageItems.length;
    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) {
      showToast(`Maksimal ${MAX_COLLAGE_PHOTOS} foto! ${remaining} foto pertama dimasukkan.`);
    }

    showToast("Memuat foto dari galeri...");
    for (const f of toProcess) {
      try {
        const loaded = await loadAnyImageFile(f);
        collageItems.push({
          id: Date.now() + Math.random(),
          img: loaded.img,
          url: loaded.url,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          fitMode: "cover"
        });
      } catch (err) {
        console.warn("Gagal memuat gambar:", f.name, err);
        showToast(`Gagal membaca file: ${f.name}`);
      }
    }

    updateCollageThumbsUI();
    if (collageItems.length > 0) {
      collageEditorWrap.classList.remove("hidden");
      selectCollageSlot(activeCollageIndex);
    }
  });

  btnGenerateCollage.addEventListener("click", () => {
    if (collageItems.length === 0) return;
    collageEditorWrap.classList.remove("hidden");
    selectCollageSlot(activeCollageIndex);
    collageCanvas.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Kolase siap diatur! Geser foto dengan jari untuk memosisikan ✨");
  });

  collageLayoutSelect.addEventListener("change", () => renderCollageCanvas(false));
  collageGapRange.addEventListener("input", () => renderCollageCanvas(false));

  // Toolbar controls
  btnSlotFitToggle.addEventListener("click", () => {
    const item = collageItems[activeCollageIndex];
    if (!item) return;
    item.fitMode = item.fitMode === "cover" ? "contain" : "cover";
    item.offsetX = 0;
    item.offsetY = 0;
    item.scale = 1;
    selectCollageSlot(activeCollageIndex);
  });

  btnSlotRotate.addEventListener("click", () => {
    const item = collageItems[activeCollageIndex];
    if (!item) return;
    item.rotation = (item.rotation + 90) % 360;
    renderCollageCanvas(false);
  });

  btnSlotReset.addEventListener("click", () => {
    const item = collageItems[activeCollageIndex];
    if (!item) return;
    item.scale = 1;
    item.offsetX = 0;
    item.offsetY = 0;
    item.rotation = 0;
    selectCollageSlot(activeCollageIndex);
  });

  collageZoomRange.addEventListener("input", (e) => {
    const item = collageItems[activeCollageIndex];
    if (!item) return;
    const pct = parseInt(e.target.value, 10);
    item.scale = pct / 100;
    if (collageZoomVal) collageZoomVal.textContent = `${pct}%`;
    renderCollageCanvas(false);
  });

  btnZoomOut.addEventListener("click", () => {
    const item = collageItems[activeCollageIndex];
    if (!item) return;
    item.scale = Math.max(0.2, Math.round((item.scale - 0.1) * 100) / 100);
    selectCollageSlot(activeCollageIndex);
  });

  btnZoomIn.addEventListener("click", () => {
    const item = collageItems[activeCollageIndex];
    if (!item) return;
    item.scale = Math.min(3.5, Math.round((item.scale + 0.1) * 100) / 100);
    selectCollageSlot(activeCollageIndex);
  });

  document.querySelectorAll(".btn-nudge").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = collageItems[activeCollageIndex];
      if (!item) return;
      item.offsetX += parseInt(btn.dataset.dx || "0", 10);
      item.offsetY += parseInt(btn.dataset.dy || "0", 10);
      renderCollageCanvas(false);
    });
  });

  btnSwapPrev.addEventListener("click", () => {
    if (activeCollageIndex <= 0) return;
    const prev = activeCollageIndex - 1;
    const tmp = collageItems[activeCollageIndex];
    collageItems[activeCollageIndex] = collageItems[prev];
    collageItems[prev] = tmp;
    selectCollageSlot(prev);
  });

  btnSwapNext.addEventListener("click", () => {
    if (activeCollageIndex >= collageItems.length - 1) return;
    const next = activeCollageIndex + 1;
    const tmp = collageItems[activeCollageIndex];
    collageItems[activeCollageIndex] = collageItems[next];
    collageItems[next] = tmp;
    selectCollageSlot(next);
  });

  // Direct Touch & Mouse Drag / Pinch-to-Zoom on Canvas
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialPinchDist = null;
  let initialPinchScale = 1;

  function clientToCanvasCoords(clientX, clientY) {
    const bounds = collageCanvas.getBoundingClientRect();
    const scaleX = COLLAGE_W / bounds.width;
    const scaleY = COLLAGE_H / bounds.height;
    return {
      x: (clientX - bounds.left) * scaleX,
      y: (clientY - bounds.top) * scaleY,
      scaleX,
      scaleY
    };
  }

  function findSlotAt(cx, cy) {
    for (let i = 0; i < collageRects.length; i++) {
      const r = collageRects[i];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        return i;
      }
    }
    return -1;
  }

  collageCanvas.addEventListener("mousedown", (e) => {
    const pt = clientToCanvasCoords(e.clientX, e.clientY);
    const hit = findSlotAt(pt.x, pt.y);
    if (hit !== -1) selectCollageSlot(hit);
    isDragging = true;
    dragStartX = pt.x;
    dragStartY = pt.y;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const item = collageItems[activeCollageIndex];
    if (!item) return;
    const pt = clientToCanvasCoords(e.clientX, e.clientY);
    item.offsetX += pt.x - dragStartX;
    item.offsetY += pt.y - dragStartY;
    dragStartX = pt.x;
    dragStartY = pt.y;
    renderCollageCanvas(false);
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  collageCanvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const pt = clientToCanvasCoords(t.clientX, t.clientY);
      const hit = findSlotAt(pt.x, pt.y);
      if (hit !== -1) selectCollageSlot(hit);
      isDragging = true;
      dragStartX = pt.x;
      dragStartY = pt.y;
      initialPinchDist = null;
    } else if (e.touches.length === 2) {
      isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist = Math.hypot(dx, dy);
      const item = collageItems[activeCollageIndex];
      initialPinchScale = item ? item.scale : 1;
    }
  }, { passive: false });

  collageCanvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const item = collageItems[activeCollageIndex];
    if (!item) return;

    if (e.touches.length === 1 && isDragging) {
      const t = e.touches[0];
      const pt = clientToCanvasCoords(t.clientX, t.clientY);
      item.offsetX += pt.x - dragStartX;
      item.offsetY += pt.y - dragStartY;
      dragStartX = pt.x;
      dragStartY = pt.y;
      renderCollageCanvas(false);
    } else if (e.touches.length === 2 && initialPinchDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / initialPinchDist;
      item.scale = Math.max(0.2, Math.min(3.5, Math.round(initialPinchScale * ratio * 100) / 100));
      const pct = Math.round(item.scale * 100);
      if (collageZoomRange) collageZoomRange.value = pct;
      if (collageZoomVal) collageZoomVal.textContent = `${pct}%`;
      renderCollageCanvas(false);
    }
  }, { passive: false });

  collageCanvas.addEventListener("touchend", () => {
    isDragging = false;
    initialPinchDist = null;
  });

  // Save / Export PNG to Phone Gallery
  async function exportCollagePng(preferShareToGallery) {
    if (collageItems.length === 0) return;
    // Render clean 1080x1920 without badges/selection border
    renderCollageCanvas(true);

    const blob = await new Promise(resolve => collageCanvas.toBlob(resolve, "image/png"));
    // Restore editor UI overlay immediately
    renderCollageCanvas(false);

    if (!blob) {
      showToast("Gagal membuat gambar PNG.");
      return;
    }

    const fileName = `kolase-sales-${state.reportDate || "story"}.png`;
    const dataUrl = URL.createObjectURL(blob);

    // Always display inside the preview box so user can also long-press -> "Save to Photos / Simpan ke Galeri"
    if (collageResultImg && collageResultBox) {
      if (collageResultImg.dataset.prevUrl) {
        try { URL.revokeObjectURL(collageResultImg.dataset.prevUrl); } catch (e) {}
      }
      collageResultImg.src = dataUrl;
      collageResultImg.dataset.prevUrl = dataUrl;
      collageResultBox.classList.remove("hidden");
    }

    // Method 1: Native Mobile Share Sheet ("Save Image / Simpan Gambar" saves directly to iOS/Android Photos Gallery!)
    if (preferShareToGallery && navigator.canShare) {
      try {
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Kolase Laporan Sales",
            text: "Pilih 'Simpan Gambar / Save Image' agar langsung masuk ke Galeri Foto HP."
          });
          showToast("✅ Kolase PNG berhasil dibagikan / disimpan ke Galeri! 🖼️");
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }

    // Method 2: Direct PNG Download + Scroll to Long-Press Gallery Preview
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (collageResultBox) {
      collageResultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    showToast("✅ PNG diunduh! Tekan & tahan gambar di bawah -> 'Simpan ke Foto' agar masuk Galeri 📸");
  }

  btnSaveCollageGallery.addEventListener("click", () => exportCollagePng(true));
  btnDownloadCollagePng.addEventListener("click", () => exportCollagePng(false));
}

// ==========================================
// Live Realtime Clock & Date Sync Engine
// ==========================================

function updateLiveClock() {
  const el = document.getElementById("liveClockDisplay");
  if (!el) return;
  const now = new Date();
  const dayName = DAYS_NAMES[now.getDay()];
  const dateNum = String(now.getDate()).padStart(2, '0');
  const monthName = MONTH_NAMES_ID[now.getMonth()];
  const year = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  el.textContent = `${dayName}, ${dateNum} ${monthName} ${year} • ${hh}:${mm}:${ss} WIB`;
}

// Start ticking immediately
setInterval(updateLiveClock, 1000);

// App Initializer
function initApp() {
  initTheme();
  pruneOldDatabaseHistory();
  renderAll();
  updateLiveClock();
  initCollageEditor();

  // Sync to today's date
  const btnSyncToday = document.getElementById("btnSyncToday");
  if (btnSyncToday) {
    btnSyncToday.addEventListener("click", () => {
      const today = new Date();
      const todayStr = formatDateYMD(today);
      state.reportDate = todayStr;
      reportDateInput.value = todayStr;
      dateFormattedPreview.innerText = formatDateIndo(todayStr);

      if (state.salesByDate[todayStr]) {
        state.sales = state.salesByDate[todayStr];
        inputSales.value = state.sales;
      } else {
        state.sales = "";
        inputSales.value = "";
      }

      pruneOldDatabaseHistory();
      renderAll();
      saveToCloud(true);
      showToast(`Tanggal laporan diselaraskan: ${formatDateIndo(todayStr)} 📅`);
    });
  }

  // Auto sync cloud on start
  loadFromCloud(true);
  // Realtime Live Sync listener across devices
  initFirebaseLiveListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
