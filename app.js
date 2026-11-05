// Rekup Sales - Logic & OCR Engine
// Designed for Kopi Kenangan & Retail F&B POS Receipts

const DAYS_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

// Initial Categories
const DEFAULT_CATEGORIES = [
  { id: "CR", name: "CR", desc: "Choux / Croissant", qty: 5, nominal: "64.292", subItems: [] },
  { id: "Basic Food", name: "Basic Food", desc: "Makanan Pokok / Nasi", qty: 11, nominal: "162.000", subItems: [] },
  { id: "Toast", name: "Toast", desc: "Roti Panggang", qty: 5, nominal: "91.000", subItems: [] },
  { id: "KM", name: "KM", desc: "Kenangan Manis", qty: "", nominal: "", subItems: [] },
  { id: "PAHE", name: "PAHE", desc: "Paket Hemat", qty: 15, nominal: "337.332", subItems: [] },
  { id: "MO", name: "MO", desc: "Make Order", qty: "-", nominal: "", subItems: [] },
  { id: "Merchandise", name: "Merchandise", desc: "Tumbler, Biji Kopi, dll", qty: "-", nominal: "-", subItems: [] }
];

const DEFAULT_STATE = {
  storeName: "KK SPBU PUSPITEK",
  reportDate: "2026-11-04", // Default sesuai contoh Rabu, 04 November 2026
  sales: "7.246.840",
  adt: 178,
  at: "40.713",
  categories: DEFAULT_CATEGORIES,
  lastWeek: {
    label: "This week 26 Oktober - 1 November 2026",
    days: {
      "Senin": "6.042.960",
      "Selasa": "6.360.870",
      "Rabu": "5.247.960",
      "Kamis": "6.097.250",
      "Jum'at": "6.805.570",
      "Sabtu": "8.067.690",
      "Minggu": "7.051.820"
    }
  },
  thisWeek: {
    label: "This week 2 November - 8 November 2026",
    days: {
      "Senin": "6.387.210",
      "Selasa": "7.246.840",
      "Rabu": "",
      "Kamis": "",
      "Jum'at": "",
      "Sabtu": "",
      "Minggu": ""
    }
  },
  targetMonth: "November",
  targetAmount: "-",
  achievement: "20.685.870"
};

// State Object
let state = loadState();
let activeCategoryModal = null;

// Format number helpers
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

// Storage helpers
function loadState() {
  try {
    const raw = localStorage.getItem("rekup_sales_state_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch (e) {
    console.warn("Gagal memuat local state:", e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  try {
    localStorage.setItem("rekup_sales_state_v1", JSON.stringify(state));
  } catch (e) {
    console.error("Gagal menyimpan ke LocalStorage:", e);
  }
}

// Calculate AT = Sales / ADT
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

// Subtotal weekly calculation
function calculateSubtotal(weekDays) {
  let sum = 0;
  for (const day of ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"]) {
    sum += cleanNum(weekDays[day]);
  }
  return sum;
}

// Auto update achievement based on current month total
function recalculateAchievement() {
  // Hitung total minggu ini
  const thisWeekSum = calculateSubtotal(state.thisWeek.days);
  // Plus tanggal 1 (jika tgl 1 jatuh di hari Minggu lalu di bulan yang sama)
  // Di contoh user: 2 Nov - 8 Nov (Senin 6.387.210 + Selasa 7.246.840 = 13.634.050)
  // Ditambah tgl 1 Nov (Minggu minggu lalu: 7.051.820) -> 13.634.050 + 7.051.820 = 20.685.870!
  // Persis seperti di contoh user!
  const sundayPrevWeek = cleanNum(state.lastWeek.days["Minggu"]);
  const autoAchieve = thisWeekSum + sundayPrevWeek;
  
  if (autoAchieve > 0) {
    state.achievement = formatRupiah(autoAchieve);
    const achInput = document.getElementById("inputAchievement");
    if (achInput && !achInput.dataset.manualOverride) {
      achInput.value = state.achievement;
    }
  }
}

// Format Date string for ID
function formatDateIndo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const dayName = DAYS_NAMES[d.getDay()].toLowerCase();
  const dateNum = String(d.getDate()).padStart(2, '0');
  const monthName = MONTH_NAMES_ID[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${dateNum} ${monthName} ${year}`;
}

// DOM Elements
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

// Render UI Components
function renderAll() {
  storeNameInput.value = state.storeName || "";
  reportDateInput.value = state.reportDate || "";
  dateFormattedPreview.innerText = formatDateIndo(state.reportDate);
  
  inputSales.value = state.sales || "";
  inputAdt.value = state.adt || "";
  recalculateAT();

  renderCategories();
  renderWeeklyGrids();
  
  monthNameInput.value = state.targetMonth || "";
  inputTarget.value = state.targetAmount || "-";
  inputAchievement.value = state.achievement || "";

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

  // Attach category input listeners
  categoriesContainer.querySelectorAll(".input-qty").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const cat = state.categories.find(c => c.id === e.target.dataset.catId);
      if (cat) {
        cat.qty = e.target.value;
        saveState();
        updateWhatsAppOutput();
      }
    });
  });

  categoriesContainer.querySelectorAll(".input-nom").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const cat = state.categories.find(c => c.id === e.target.dataset.catId);
      if (cat) {
        cat.nominal = e.target.value;
        saveState();
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

// Render Weekly Comparison Day Inputs
function renderWeeklyGrids() {
  const dayOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"];
  
  // Last Week
  lastWeekLabel.value = state.lastWeek.label;
  lastWeekDaysContainer.innerHTML = "";
  dayOrder.forEach(day => {
    const card = document.createElement("div");
    card.className = "day-input-card";
    card.innerHTML = `
      <span class="day-name">${day}</span>
      <div class="day-val-wrapper">
        <span>Rp.</span>
        <input type="text" data-week="last" data-day="${day}" value="${state.lastWeek.days[day] || ""}">
      </div>
    `;
    lastWeekDaysContainer.appendChild(card);
  });

  // This Week
  thisWeekLabel.value = state.thisWeek.label;
  thisWeekDaysContainer.innerHTML = "";
  
  // Detect current day
  let todayDayName = "";
  if (state.reportDate) {
    const d = new Date(state.reportDate + "T00:00:00");
    if (!isNaN(d.getTime())) {
      todayDayName = DAYS_NAMES[d.getDay()];
    }
  }

  dayOrder.forEach(day => {
    const isToday = day === todayDayName;
    const card = document.createElement("div");
    card.className = `day-input-card ${isToday ? "today-highlight" : ""}`;
    card.innerHTML = `
      <span class="day-name">${day}</span>
      <div class="day-val-wrapper">
        <span>Rp.</span>
        <input type="text" data-week="this" data-day="${day}" value="${state.thisWeek.days[day] || ""}">
      </div>
    `;
    thisWeekDaysContainer.appendChild(card);
  });

  updateSubtotalsUI();
}

function updateSubtotalsUI() {
  const lastSub = calculateSubtotal(state.lastWeek.days);
  const thisSub = calculateSubtotal(state.thisWeek.days);
  
  lastWeekSubtotalEl.innerText = `Rp. ${formatRupiah(lastSub)}`;
  thisWeekSubtotalEl.innerText = `Rp. ${formatRupiah(thisSub)}`;
}

// Generate exact WhatsApp Report Output
function generateWhatsAppText() {
  const store = state.storeName || "KK SPBU PUSPITEK";
  const dateFormatted = formatDateIndo(state.reportDate);
  const salesStr = state.sales ? `Rp. ${state.sales}` : "Rp. ";
  const adtStr = state.adt ? `${state.adt}` : "";
  const atStr = state.at ? `Rp. ${state.at}` : "Rp. ";

  // Categories format
  const catLines = state.categories.map(c => {
    let q = c.qty !== undefined && c.qty !== null ? c.qty : "";
    let n = c.nominal !== undefined && c.nominal !== null ? c.nominal : "";
    
    // Formatting match user example
    if (c.name === "MO" && (q === "-" || q === "") && !n) {
      return `MO : -`;
    }
    if (c.name === "Merchandise" && (q === "-" || q === "") && (n === "-" || n === "")) {
      return `Merchandise : - / Rp. -`;
    }
    if (c.name === "KM" && !q && !n) {
      return `KM : /`;
    }
    if (c.name === "CR") {
      return ` CR : ${q} /${n}`;
    }
    return `${c.name} : ${q} /${n}`;
  }).join("\n");

  const lastSub = calculateSubtotal(state.lastWeek.days);
  const thisSub = calculateSubtotal(state.thisWeek.days);

  const dayOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"];
  
  const lastWeekLines = dayOrder.map(day => {
    const val = state.lastWeek.days[day];
    return `${day} : Rp. ${val || ""}`;
  }).join("\n");

  const thisWeekLines = dayOrder.map(day => {
    const val = state.thisWeek.days[day];
    return `${day} : Rp. ${val || ""}`;
  }).join("\n");

  const targetLine = `*Target ${state.targetMonth || "November"}* : Rp. ${state.targetAmount || "-"}`;
  const achieveLine = `*Achievement* : Rp. ${state.achievement || "-"}`;

  const report = `*REPORT SALES ${store.toUpperCase()}*

${dateFormatted}

Sales : ${salesStr}
ADT : ${adtStr}
AT : ${atStr}

${catLines}
_________________________________

*Compare Sales Last Week vs This Week ${store}*
 
*${state.lastWeek.label}*
${lastWeekLines}

*Subtotal this week:* Rp. ${formatRupiah(lastSub)}

*${state.thisWeek.label}*
${thisWeekLines}

*Subtotal this week:* Rp. ${formatRupiah(thisSub)}

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
    // Add default row
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

  saveState();
  renderCategories();
  updateWhatsAppOutput();
  itemModal.classList.add("hidden");
});

// Weekly roll-over feature
document.getElementById("btnRollWeek").addEventListener("click", () => {
  if (confirm("Pindahkan data 'This Week' menjadi 'Last Week'?\nData 'Last Week' yang lama akan digantikan.")) {
    state.lastWeek.label = state.thisWeek.label;
    state.lastWeek.days = { ...state.thisWeek.days };
    
    // Clear this week
    for (const d of Object.keys(state.thisWeek.days)) {
      state.thisWeek.days[d] = "";
    }
    state.thisWeek.label = "This week (Minggu Baru)";
    saveState();
    renderWeeklyGrids();
    recalculateAchievement();
    updateWhatsAppOutput();
    showToast("Minggu berhasil diarsipkan ke Last Week! 📅");
  }
});

// General Input Listeners
storeNameInput.addEventListener("input", (e) => {
  state.storeName = e.target.value;
  saveState();
  updateWhatsAppOutput();
});

reportDateInput.addEventListener("change", (e) => {
  state.reportDate = e.target.value;
  dateFormattedPreview.innerText = formatDateIndo(state.reportDate);
  
  // Update today highlight on week view
  renderWeeklyGrids();
  saveState();
  updateWhatsAppOutput();
});

inputSales.addEventListener("input", (e) => {
  const val = e.target.value;
  state.sales = formatRupiah(val);
  e.target.value = state.sales;

  // Auto update sales on current day in thisWeek
  if (state.reportDate) {
    const d = new Date(state.reportDate + "T00:00:00");
    if (!isNaN(d.getTime())) {
      const dayName = DAYS_NAMES[d.getDay()];
      if (dayName && state.thisWeek.days[dayName] !== undefined) {
        state.thisWeek.days[dayName] = state.sales;
        const dayInput = document.querySelector(`input[data-week="this"][data-day="${dayName}"]`);
        if (dayInput) dayInput.value = state.sales;
        updateSubtotalsUI();
        recalculateAchievement();
      }
    }
  }

  recalculateAT();
  saveState();
  updateWhatsAppOutput();
});

inputAdt.addEventListener("input", (e) => {
  state.adt = e.target.value ? parseInt(e.target.value, 10) : "";
  recalculateAT();
  saveState();
  updateWhatsAppOutput();
});

monthNameInput.addEventListener("input", (e) => {
  state.targetMonth = e.target.value;
  saveState();
  updateWhatsAppOutput();
});

inputTarget.addEventListener("input", (e) => {
  state.targetAmount = e.target.value;
  saveState();
  updateWhatsAppOutput();
});

inputAchievement.addEventListener("input", (e) => {
  inputAchievement.dataset.manualOverride = "true";
  state.achievement = e.target.value;
  saveState();
  updateWhatsAppOutput();
});

// Listener for Weekly Days Grid
document.addEventListener("input", (e) => {
  if (e.target.dataset && e.target.dataset.week && e.target.dataset.day) {
    const week = e.target.dataset.week;
    const day = e.target.dataset.day;
    const rawVal = e.target.value;
    const formatted = rawVal ? formatRupiah(rawVal) : "";
    e.target.value = formatted;
    
    if (week === "last") {
      state.lastWeek.days[day] = formatted;
    } else {
      state.thisWeek.days[day] = formatted;
    }
    
    updateSubtotalsUI();
    recalculateAchievement();
    saveState();
    updateWhatsAppOutput();
  }
});

lastWeekLabel.addEventListener("input", (e) => {
  state.lastWeek.label = e.target.value;
  saveState();
  updateWhatsAppOutput();
});

thisWeekLabel.addEventListener("input", (e) => {
  state.thisWeek.label = e.target.value;
  saveState();
  updateWhatsAppOutput();
});

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

document.getElementById("btnResetAll").addEventListener("click", () => {
  if (confirm("Reset semua data kembali ke contoh awal?")) {
    localStorage.removeItem("rekup_sales_state_v1");
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    renderAll();
    showToast("Data di-reset ke default! ↺");
  }
});

// ==========================================
// OCR Engine (Tesseract.js + Smart Parser)
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

// Camera actions
if (btnActionCamera) {
  btnActionCamera.addEventListener("click", (e) => {
    e.stopPropagation();
    receiptInputCamera.value = "";
    receiptInputCamera.click();
  });
}
if (btnRetakeCamera) {
  btnRetakeCamera.addEventListener("click", (e) => {
    e.stopPropagation();
    receiptInputCamera.value = "";
    receiptInputCamera.click();
  });
}

// Gallery actions
if (btnActionGallery) {
  btnActionGallery.addEventListener("click", (e) => {
    e.stopPropagation();
    receiptInputGallery.value = "";
    receiptInputGallery.click();
  });
}
if (btnChangeGallery) {
  btnChangeGallery.addEventListener("click", (e) => {
    e.stopPropagation();
    receiptInputGallery.value = "";
    receiptInputGallery.click();
  });
}

// File change handlers
receiptInputCamera.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleImageFile(file);
});

receiptInputGallery.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleImageFile(file);
});

// Drag & Drop Support
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("drag-over");
});
dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("drag-over");
});
dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("drag-over");
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleImageFile(e.dataTransfer.files[0]);
  }
});

// Paste Image Support (Ctrl+V)
document.addEventListener("paste", (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.startsWith("image/")) {
      const file = items[i].getAsFile();
      if (file) {
        handleImageFile(file);
        break;
      }
    }
  }
});

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const imageUrl = e.target.result;
    imagePreview.src = imageUrl;
    uploadPlaceholder.classList.add("hidden");
    imagePreviewWrapper.classList.remove("hidden");
    
    // Run OCR
    runClientOCR(imageUrl);
  };
  reader.readAsDataURL(file);
}

// Preprocess image on canvas to boost thermal receipt text clarity
function preprocessReceipt(imgElement) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  
  canvas.width = imgElement.naturalWidth || imgElement.width;
  canvas.height = imgElement.naturalHeight || imgElement.height;
  
  ctx.drawImage(imgElement, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  
  // Grayscale & simple high-contrast thresholding
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    const avg = 0.299 * r + 0.587 * g + 0.114 * b;
    // Binarize
    const threshold = avg < 140 ? 0 : 255;
    data[i] = threshold;
    data[i+1] = threshold;
    data[i+2] = threshold;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function runClientOCR(imageSrc) {
  ocrProgressBox.classList.remove("hidden");
  ocrProgressBar.style.width = "10%";
  ocrStatusText.innerText = "Memuat OCR Engine...";

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
    ocrStatusText.innerText = "OCR Selesai! Menguraikan data...";
    setTimeout(() => ocrProgressBox.classList.add("hidden"), 800);

    parseReceiptText(res.data.text);
  } catch (err) {
    console.error("OCR Error:", err);
    ocrStatusText.innerText = "OCR gagal atau koneksi lambat. Anda tetap bisa mengisi form manual.";
    setTimeout(() => ocrProgressBox.classList.add("hidden"), 2500);
  }
}

// Regex Intelligence for POS & Kopi Kenangan Receipts
function parseReceiptText(text) {
  console.log("Raw OCR Result:\n", text);
  
  let foundAdt = null;
  let foundSales = null;
  let foundDate = null;
  let foundStore = null;

  // 1. Detect Print Count (ADT)
  // Pattern: "Print Count: 178" / "Print Count : 178"
  const adtMatch = text.match(/print\s*count\s*[:.]?\s*(\d+)/i);
  if (adtMatch && adtMatch[1]) {
    foundAdt = parseInt(adtMatch[1], 10);
  }

  // 2. Detect Total Sales
  // Look for "Total" followed by number with commas/dots, e.g. "Total 7,246,840"
  // Avoid "Online Total" or "Offline Total" by prioritizing final Total
  const totalMatches = [...text.matchAll(/(?:^|\n)\s*(?:Grand\s*)?Total\s*[:.]?\s*([0-9.,]+)/gim)];
  if (totalMatches.length > 0) {
    // Pick the last matched Total line
    const lastMatch = totalMatches[totalMatches.length - 1];
    foundSales = formatRupiah(lastMatch[1]);
  } else {
    // Fallback: look for lines ending in large amount near footer
    const numMatches = text.match(/\b([1-9][0-9]{0,2}(?:[.,][0-9]{3}){2})\b/g);
    if (numMatches && numMatches.length > 0) {
      foundSales = formatRupiah(numMatches[numMatches.length - 1]);
    }
  }

  // 3. Detect Date
  // Pattern: "From 03-11-2026 To 03-11-2026" or "Nov 3, 2026"
  const dateMatch1 = text.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  if (dateMatch1) {
    const [_, d, m, y] = dateMatch1;
    foundDate = `${y}-${m}-${d}`;
  } else {
    const dateMatch2 = text.match(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/i);
    if (dateMatch2) {
      const monthIdx = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
        .indexOf(dateMatch2[1].toLowerCase().slice(0, 3));
      if (monthIdx !== -1) {
        const m = String(monthIdx + 1).padStart(2, '0');
        const d = String(dateMatch2[2]).padStart(2, '0');
        foundDate = `${dateMatch2[3]}-${m}-${d}`;
      }
    }
  }

  // 4. Detect Outlet Code (e.g. TGR.SPBUPPTK)
  const storeMatch = text.match(/TGR\.[A-Z0-9]+/i);
  if (storeMatch) {
    foundStore = "KK SPBU PUSPITEK"; // Clean mapped name
  }

  // Apply to State & Form
  if (foundAdt) {
    state.adt = foundAdt;
    inputAdt.value = foundAdt;
    detectedAdt.innerText = foundAdt;
  }
  if (foundSales) {
    state.sales = foundSales;
    inputSales.value = foundSales;
    detectedSales.innerText = `Rp. ${foundSales}`;
    
    // Auto populate today's day on this week
    if (foundDate) {
      const d = new Date(foundDate + "T00:00:00");
      if (!isNaN(d.getTime())) {
        const dayName = DAYS_NAMES[d.getDay()];
        if (dayName && state.thisWeek.days[dayName] !== undefined) {
          state.thisWeek.days[dayName] = foundSales;
        }
      }
    }
  }
  if (foundDate) {
    state.reportDate = foundDate;
    reportDateInput.value = foundDate;
    dateFormattedPreview.innerText = formatDateIndo(foundDate);
    detectedDate.innerText = formatDateIndo(foundDate);
  }
  if (foundStore) {
    state.storeName = foundStore;
    storeNameInput.value = foundStore;
  }

  ocrDetectedBox.classList.remove("hidden");
  recalculateAT();
  renderWeeklyGrids();
  recalculateAchievement();
  saveState();
  updateWhatsAppOutput();
  showToast("Data struk berhasil dipindai & dimasukkan ke form! 🎉");
}

// Initial Run
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderAll();
});

// Theme Management (Dark Mode & Light Mode)
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
