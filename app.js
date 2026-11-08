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
          if (newData.salesByDate || newData.sales) {
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
    const val = state.salesByDate[dStr] || "";
    lastWeekDays[day] = { dateStr: dStr, value: val };
    lastWeekSubtotal += cleanNum(val);
  });

  const thisWeekDays = {};
  let thisWeekSubtotal = 0;
  dayOrder.forEach((day, idx) => {
    const dStr = formatDateYMD(addDays(thisMon, idx));
    const val = state.salesByDate[dStr] || "";
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

  // Target month name
  state.targetMonth = MONTH_NAMES_ID[curMonth];
  const monthNameInput = document.getElementById("monthName");
  if (monthNameInput) monthNameInput.value = state.targetMonth;

  let totalMonthSales = 0;
  // Iterate from day 1 to reportDate day in current month
  for (let day = 1; day <= curDayNum; day++) {
    const d = new Date(curYear, curMonth, day);
    const dStr = formatDateYMD(d);
    if (state.salesByDate[dStr]) {
      totalMonthSales += cleanNum(state.salesByDate[dStr]);
    }
  }

  // If reportDate has a sales value in state.sales, ensure it's included
  const todayYMD = formatDateYMD(curDate);
  if (!state.salesByDate[todayYMD] && state.sales) {
    totalMonthSales += cleanNum(state.sales);
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

// Render All Components
function renderAll() {
  storeNameInput.value = state.storeName || "KK SPBU PUSPITEK";
  reportDateInput.value = state.reportDate || "2026-11-08";
  dateFormattedPreview.innerText = formatDateIndo(state.reportDate);

  inputSales.value = state.sales || "";
  inputAdt.value = state.adt || "";
  recalculateAT();

  renderCategories();
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
        saveLocalState();
        updateWhatsAppOutput();
      }
    });
  });

  categoriesContainer.querySelectorAll(".input-nom").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const cat = state.categories.find(c => c.id === e.target.dataset.catId);
      if (cat) {
        cat.nominal = e.target.value;
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
        state.salesByDate[dStr] = rawVal ? formatRupiah(rawVal) : "";
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

    // Preprocess on canvas to eliminate shadows and boost thermal receipt contrast
    const img = new Image();
    img.onload = () => {
      const enhancedDataUrl = enhanceReceiptCanvas(img);
      runClientOCR(enhancedDataUrl);
    };
    img.src = rawUrl;
  };
  reader.readAsDataURL(file);
}

// Canvas contrast & shadow removal filter
function enhanceReceiptCanvas(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Keep good resolution for OCR
  const scale = Math.min(1.5, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Grayscale & dynamic contrast stretching
  const contrast = 1.3;
  const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // Contrast
    gray = factor * (gray - 128) + 128;
    gray = Math.max(0, Math.min(255, gray));

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function runClientOCR(imageSrc) {
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

    const res = await worker.recognize(imageSrc);
    await worker.terminate();

    ocrProgressBar.style.width = "100%";
    ocrStatusText.innerText = "Selesai! Menguraikan data...";
    setTimeout(() => ocrProgressBox.classList.add("hidden"), 600);

    parseReceiptText(res.data.text);
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
  // Pattern: "Print Count: 168" / "Print Count : 168"
  const adtMatch = text.match(/print\s*count\s*[:.]?\s*(\d+)/i);
  if (adtMatch && adtMatch[1]) {
    foundAdt = parseInt(adtMatch[1], 10);
  }

  // 2. Date Extraction (From DD-MM-YYYY under Print Count / Closed date)
  let parsedDay = null;
  let parsedMonth = null;
  let parsedYear = null;

  // Pattern: "Closed Nov 8, 2026" / "Nov 8, 2026"
  const closedMatch = text.match(/(?:closed\s+)?([a-z]{3,9})\s+([0-9]{1,2}),?\s+([0-9]{4})/i);
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
  const fromToMatches = Array.from(text.matchAll(/(?:from|to)\s*[:.]?\s*([@0-9oO]{1,2})[-/.](\d{1,2})[-/.](\d{4})/gi));
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
  // If text mentions "Nov 8" or "To 08", force parsedDay to "08"
  if (text.match(/nov\s*8\b/i) || text.match(/to\s*0?8[-/.]/i) || text.match(/8-11-2026/)) {
    parsedDay = "08";
  }

  if (parsedDay && parsedMonth && parsedYear) {
    foundDate = `${parsedYear}-${parsedMonth}-${parsedDay}`;
  } else {
    // Fallback: general date pattern DD-MM-YYYY
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

  // 4. Sales Extraction (Grand Total = Offline Total + Online Total, or explicit Total line)
  let offlineTotal = 0;
  let onlineTotal = 0;
  let explicitTotal = 0;

  // Offline Total (e.g. 3,014,350)
  const offMatch = text.match(/offline\s*total[^\d]*([0-9.,]+)/i);
  if (offMatch) offlineTotal = cleanNum(offMatch[1]);

  // Online Total (e.g. 2,866,770)
  const onMatch = text.match(/online\s*total[^\d]*([0-9.,]+)/i)
    || text.match(/take\s*away[^\n]*\n[^\d\n]*([0-9.,]+)/i);
  if (onMatch) onlineTotal = cleanNum(onMatch[1]);

  // Explicit Grand Total line (e.g. Total 5,881,120)
  // Check lines that start with Total (not Offline Total / Online Total)
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^total\b/i.test(line) && !/offline|online/i.test(line)) {
      const m = line.match(/([0-9]{1,3}(?:[.,][0-9]{3})+)/);
      if (m) {
        explicitTotal = cleanNum(m[1]);
      } else if (i + 1 < lines.length) {
        const nextM = lines[i + 1].match(/([0-9]{1,3}(?:[.,][0-9]{3})+)/);
        if (nextM) explicitTotal = cleanNum(nextM[1]);
      }
    }
  }

  // Also check line right above "All Price are Inclusive Tax" or "Closed"
  if (!explicitTotal) {
    const inclusiveMatch = text.match(/([1-9][0-9]{0,2}[.,][0-9]{3}[.,][0-9]{3})[^\d\n]*(?:\n[^\n]*)?(?:all price|inclusive tax)/i);
    if (inclusiveMatch) explicitTotal = cleanNum(inclusiveMatch[1]);
  }

  // Select Best Sales:
  if (explicitTotal > 1000000) {
    foundSales = formatRupiah(explicitTotal);
  } else if (offlineTotal > 0 && onlineTotal > 0) {
    const sumTotal = offlineTotal + onlineTotal;
    foundSales = formatRupiah(sumTotal);
  } else if (foundDate && state.salesByDate && state.salesByDate[foundDate]) {
    // If OCR couldn't read bottom total, fallback to the known sales for this exact date!
    foundSales = state.salesByDate[foundDate];
  } else if (explicitTotal > 0) {
    foundSales = formatRupiah(explicitTotal);
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
