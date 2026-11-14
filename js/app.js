const supabaseClient = window.supabaseClient;
if (!supabaseClient) throw new Error("Supabase is not configured. Check js/supabase-config.js.");

// ─── DOM references ───────────────────────────────────────────────────────────
const searchInput      = document.getElementById("searchInput");
const searchButton     = document.getElementById("searchButton");
const subjectFilter    = document.getElementById("subjectFilter");
const teacherFilter    = document.getElementById("teacherFilter");
const classFilter      = document.getElementById("classFilter");
const sortFilter       = document.getElementById("sortFilter");
const notesGrid        = document.getElementById("notesGrid");
const noteCount        = document.getElementById("noteCount");
const pdfViewer        = document.getElementById("pdfViewer");
const readerDownload   = document.getElementById("readerDownload");
const readerMeta       = document.getElementById("readerMeta");
const readerLoading    = document.getElementById("readerLoading");
const readerError      = document.getElementById("readerError");
const readerErrorMessage = document.getElementById("readerErrorMessage");
const openPdfExternal  = document.getElementById("openPdfExternal");
const retryReader      = document.getElementById("retryReader");
const pdfPages         = document.getElementById("pdfPages");
const readerStage      = document.getElementById("readerStage");
const readerSidebar    = document.getElementById("readerSidebar");
const thumbnailList    = document.getElementById("thumbnailList");
const currentPageInput = document.getElementById("currentPage");
const totalPagesLabel  = document.getElementById("totalPages");
const zoomLevel        = document.getElementById("zoomLevel");
const readerStatus     = document.getElementById("readerStatus");
const viewerTitle      = document.getElementById("viewerTitle");
const closeViewer      = document.getElementById("closeViewer");
const savedOnlyButton  = document.getElementById("savedOnlyButton");
const savedCount       = document.getElementById("savedCount");

// ─── State ─────────────────────────────────────────────────────────────────────
const SAVED_NOTES_KEY    = "studyshelf:saved-notes:v1";
const RECENT_NOTES_KEY   = "studyshelf:recent-notes:v1";
const PDF_PAGES_KEY      = "studyshelf:pdf-page:v1";
const BUCKET_NAME        = "study-notes";
const RECENT_MAX         = 4;
const PAGE_SIZE          = 12;

let notes        = [];
let loadingNotes = false;
let savedOnly    = false;
let currentPage  = 1;

let savedNoteIds  = loadSavedNoteIds();
let recentNoteIds = loadRecentNoteIds();
let pdfPageStore  = loadPdfPageStore();

let activePdf = null, activePdfUrl = "", activePdfName = "study-notes.pdf", activeNote = null;
let readerScale = 1, fitToWidth = true, pageRenderObserver = null;
let pageRenderTasks = new Map(), thumbnailRenderTasks = new Map();
let readerOpenToken = 0, zoomRenderTimer = null, zoomWheelFrame = 0;
let queuedWheelDelta = 0, lastZoomPaint = 1, fitWidthScale = 1;
let zoomPreviewTimer = null, zoomGeneration = 0;

// ─── Subject colour palette ───────────────────────────────────────────────────
const SUBJECT_COLOURS = [
  { bg: "#e8f0fe", icon: "#3b7dd8", border: "#c5d8ff" }, // blue
  { bg: "#e6f4ea", icon: "#2e7d52", border: "#bde0cb" }, // green
  { bg: "#fce8e6", icon: "#c0392b", border: "#f5c0bb" }, // red
  { bg: "#fff3e0", icon: "#e07b00", border: "#ffd5a0" }, // orange
  { bg: "#f3e8fd", icon: "#7b2fb5", border: "#ddb5f7" }, // purple
  { bg: "#e0f7fa", icon: "#00737a", border: "#a0dde4" }, // teal
  { bg: "#fdf6e3", icon: "#9b6800", border: "#f5dfa0" }, // yellow
  { bg: "#fce4ec", icon: "#b7275e", border: "#f5b4cd" }, // pink
];
const subjectColourMap = {};
function getSubjectColour(subject) {
  const key = String(subject || "").toLowerCase().trim();
  if (!subjectColourMap[key]) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    subjectColourMap[key] = SUBJECT_COLOURS[hash % SUBJECT_COLOURS.length];
  }
  return subjectColourMap[key];
}

// ─── Subject icon map ─────────────────────────────────────────────────────────
const SUBJECT_ICONS = {
  math: "📐", mathematics: "📐", maths: "📐",
  physics: "⚛️", chemistry: "🧪", biology: "🧬",
  science: "🔬", english: "📖", history: "🏛️",
  geography: "🌍", computer: "💻", economics: "📊",
  commerce: "💰", accounts: "🗂️", accountancy: "🗂️",
  political: "⚖️", sociology: "🤝", psychology: "🧠",
  philosophy: "💡", art: "🎨", music: "🎵",
  physical: "🏃", default: "📚",
};
function getSubjectIcon(subject) {
  const key = String(subject || "").toLowerCase();
  for (const [k, icon] of Object.entries(SUBJECT_ICONS)) {
    if (key.includes(k)) return icon;
  }
  return SUBJECT_ICONS.default;
}

// ─── LocalStorage helpers ────────────────────────────────────────────────────
function loadSavedNoteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_NOTES_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch { return new Set(); }
}
function persistSavedNoteIds() {
  try { localStorage.setItem(SAVED_NOTES_KEY, JSON.stringify([...savedNoteIds])); return true; }
  catch { return false; }
}
function loadRecentNoteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_NOTES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}
function persistRecentNoteIds() {
  try { localStorage.setItem(RECENT_NOTES_KEY, JSON.stringify(recentNoteIds)); } catch {}
}
function pushRecentNote(id) {
  const sid = String(id);
  recentNoteIds = [sid, ...recentNoteIds.filter(x => x !== sid)].slice(0, RECENT_MAX);
  persistRecentNoteIds();
}
function loadPdfPageStore() {
  try { return JSON.parse(localStorage.getItem(PDF_PAGES_KEY) || "{}"); } catch { return {}; }
}
function savePdfPage(noteId, page) {
  try { pdfPageStore[String(noteId)] = page; localStorage.setItem(PDF_PAGES_KEY, JSON.stringify(pdfPageStore)); } catch {}
}
function getSavedPdfPage(noteId) {
  return pdfPageStore[String(noteId)] || 1;
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Date unavailable" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── URL param state ──────────────────────────────────────────────────────────
function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    search:  params.get("q")       || "",
    subject: params.get("subject") || "all",
    cls:     params.get("class")   || "all",
    teacher: params.get("teacher") || "all",
    sort:    params.get("sort")    || "newest",
    note:    params.get("note")    || "",
  };
}
function writeUrlState() {
  const params = new URLSearchParams();
  const q = searchInput.value.trim();
  const subject = subjectFilter?.value || "all";
  const cls     = classFilter?.value   || "all";
  const teacher = teacherFilter?.value || "all";
  const sort    = sortFilter?.value    || "newest";
  if (q)              params.set("q",       q);
  if (subject !== "all") params.set("subject", subject);
  if (cls     !== "all") params.set("class",   cls);
  if (teacher !== "all") params.set("teacher", teacher);
  if (sort    !== "newest") params.set("sort", sort);
  const newSearch = params.toString() ? "?" + params.toString() : window.location.pathname;
  history.replaceState(null, "", newSearch);
}
function applyUrlState() {
  const s = readUrlState();
  if (s.search  && searchInput)  searchInput.value  = s.search;
  if (s.sort    && sortFilter)   sortFilter.value   = s.sort;
  // subject/class/teacher applied after dropdowns are populated in updateXFilter
  window.__pendingUrlState = s;
}

// ─── Filter dropdowns ─────────────────────────────────────────────────────────
function updateClassFilter() {
  if (!classFilter) return;
  const old = window.__pendingUrlState?.cls || classFilter.value || "all";
  const classNames = ["Class 11", "Class 12", ...notes.map(n => String(n.className || "").trim()).filter(Boolean)];
  const seen = new Set();
  const classes = classNames.filter(c => { const k = c.toLocaleLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  classFilter.innerHTML = '<option value="all">All classes</option>' + classes.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
  classFilter.value = classes.includes(old) ? old : "all";
}
function updateSubjectFilter() {
  if (!subjectFilter) return;
  const old = window.__pendingUrlState?.subject || subjectFilter.value || "all";
  const subjects = [...new Set(notes.map(n => n.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  subjectFilter.innerHTML = '<option value="all">All subjects</option>' + subjects.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("");
  subjectFilter.value = subjects.includes(old) ? old : "all";
}
function updateTeacherFilter() {
  if (!teacherFilter) return;
  const old = window.__pendingUrlState?.teacher || teacherFilter.value || "all";
  const teachers = [...new Set(notes.map(n => String(n.teacher || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  teacherFilter.innerHTML = '<option value="all">All teachers</option>' + teachers.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
  teacherFilter.value = teachers.includes(old) ? old : "all";
}

// ─── Active filter chips ───────────────────────────────────────────────────────
function renderFilterChips() {
  let container = document.getElementById("filterChips");
  if (!container) {
    container = document.createElement("div");
    container.id = "filterChips";
    container.className = "filter-chips";
    // Insert after saved-toolbar-row
    const savedRow = document.querySelector(".saved-toolbar-row");
    if (savedRow) savedRow.after(container);
  }
  const chips = [];
  const q       = searchInput?.value.trim();
  const subject = subjectFilter?.value;
  const cls     = classFilter?.value;
  const teacher = teacherFilter?.value;
  if (q)              chips.push({ label: `"${q}"`,    clear: () => { searchInput.value = ""; renderNotes(); } });
  if (subject !== "all") chips.push({ label: subject, clear: () => { subjectFilter.value = "all"; renderNotes(); } });
  if (cls     !== "all") chips.push({ label: cls,     clear: () => { classFilter.value   = "all"; renderNotes(); } });
  if (teacher !== "all") chips.push({ label: teacher, clear: () => { teacherFilter.value = "all"; renderNotes(); } });
  if (!chips.length) { container.innerHTML = ""; return; }
  container.innerHTML = chips.map((c, i) =>
    `<button type="button" class="filter-chip" data-chip="${i}">${escapeHTML(c.label)} <span aria-hidden="true">×</span></button>`
  ).join("") + `<button type="button" class="filter-chip filter-chip-clear">Clear all</button>`;
  container.querySelectorAll("[data-chip]").forEach(btn => {
    btn.addEventListener("click", () => { chips[Number(btn.dataset.chip)].clear(); });
  });
  container.querySelector(".filter-chip-clear").addEventListener("click", () => {
    if (searchInput)  searchInput.value  = "";
    if (subjectFilter) subjectFilter.value = "all";
    if (classFilter)   classFilter.value   = "all";
    if (teacherFilter) teacherFilter.value = "all";
    renderNotes();
  });
}

// ─── Recently viewed section ──────────────────────────────────────────────────
function renderRecentlyViewed() {
  let section = document.getElementById("recentlyViewedSection");
  const recentNotes = recentNoteIds.map(id => notes.find(n => String(n.id) === id)).filter(Boolean);

  if (!recentNotes.length) {
    if (section) section.remove();
    return;
  }

  if (!section) {
    section = document.createElement("div");
    section.id = "recentlyViewedSection";
    section.className = "recently-viewed container";
    const librarySection = document.getElementById("library");
    if (librarySection) librarySection.prepend(section);
  }

  section.innerHTML = `
    <div class="recently-viewed-header">
      <span class="eyebrow eyebrow-muted"><span class="eyebrow-dot"></span> RECENTLY VIEWED</span>
      <button type="button" class="rv-clear-btn" id="clearRecentBtn">Clear</button>
    </div>
    <div class="rv-grid">
      ${recentNotes.map(n => {
        const col = getSubjectColour(n.subject);
        return `<button type="button" class="rv-card" data-id="${escapeHTML(String(n.id))}" style="--rv-bg:${col.bg};--rv-border:${col.border};--rv-icon:${col.icon}">
          <span class="rv-icon" aria-hidden="true">${getSubjectIcon(n.subject)}</span>
          <span class="rv-info">
            <b>${escapeHTML(n.title)}</b>
            <small>${escapeHTML(n.subject)}${n.className ? ` · ${escapeHTML(n.className)}` : ""}</small>
          </span>
          <span class="rv-arrow" aria-hidden="true">↗</span>
        </button>`;
      }).join("")}
    </div>`;

  section.querySelectorAll(".rv-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const note = notes.find(n => String(n.id) === String(btn.dataset.id));
      if (note) openPDFReader(note);
    });
  });
  document.getElementById("clearRecentBtn")?.addEventListener("click", () => {
    recentNoteIds = [];
    persistRecentNoteIds();
    renderRecentlyViewed();
  });
}

// ─── Search helpers ───────────────────────────────────────────────────────────
function normalizeSearchText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > 2) return 3;
    previous = current;
  }
  return previous[b.length];
}
function matchesSearch(note, rawTerm) {
  const query = normalizeSearchText(rawTerm);
  if (!query) return true;
  const fields  = [note.title, note.subject, note.className, note.teacher, note.fileName].map(normalizeSearchText);
  const combined = fields.join(" ");
  if (combined.includes(query)) return true;
  const queryWords = query.split(/\s+/).filter(Boolean);
  const fieldWords = [...new Set(combined.split(/\s+/).filter(Boolean))];
  return queryWords.every(word => {
    if (fieldWords.some(c => c.includes(word) || word.includes(c))) return true;
    if (word.length < 4) return false;
    const maxDist = word.length >= 7 ? 2 : 1;
    return fieldWords.some(c => Math.abs(c.length - word.length) <= maxDist && editDistance(word, c) <= maxDist);
  });
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function showSkeletonCards(count = 6) {
  notesGrid.innerHTML = Array.from({ length: count }, () => `
    <div class="note-card skeleton-card" aria-hidden="true">
      <div class="note-card-content">
        <div class="skel skel-icon"></div>
        <div class="skel skel-tag"></div>
        <div class="skel skel-title"></div>
        <div class="skel skel-line"></div>
        <div class="skel skel-line short"></div>
      </div>
      <div class="note-actions">
        <div class="skel skel-btn"></div>
        <div class="skel skel-btn"></div>
      </div>
    </div>`).join("");
}

// ─── Share note ───────────────────────────────────────────────────────────────
function shareNote(note) {
  const url = new URL(window.location.href.split("?")[0]);
  url.searchParams.set("note", String(note.id));
  const shareUrl = url.toString();
  if (navigator.share) {
    navigator.share({ title: note.title, text: `Check out "${note.title}" on StudyShelf`, url: shareUrl }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareUrl)
      .then(() => showToast("Link copied to clipboard!"))
      .catch(() => { showToast("Share: " + shareUrl); });
  }
}

// ─── Render notes ─────────────────────────────────────────────────────────────
function renderNotes() {
  const term          = searchInput?.value.trim() || "";
  const selected      = subjectFilter?.value      || "all";
  const selectedClass = classFilter?.value        || "all";
  const selectedTeacher = teacherFilter?.value    || "all";
  const sort          = sortFilter?.value         || "newest";

  writeUrlState();
  renderFilterChips();

  let filtered = notes.filter(n =>
    matchesSearch(n, term) &&
    (selected        === "all" || n.subject   === selected) &&
    (selectedClass   === "all" || n.className === selectedClass) &&
    (selectedTeacher === "all" || n.teacher   === selectedTeacher) &&
    (!savedOnly || savedNoteIds.has(String(n.id)))
  );

  if (sort === "az") filtered.sort((a, b) => a.title.localeCompare(b.title));
  else filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Update counters
  const totalFiltered = filtered.length;
  noteCount.textContent = `${totalFiltered} ${totalFiltered === 1 ? "note" : "notes"}`;
  noteCount.classList.remove("count-updated");
  requestAnimationFrame(() => { noteCount.classList.add("count-updated"); setTimeout(() => noteCount.classList.remove("count-updated"), 220); });

  const heroCount = document.getElementById("heroNoteCount");
  if (heroCount) {
    const target = notes.length;
    if (heroCount.dataset.counted !== "true" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      heroCount.dataset.counted = "true";
      const started = performance.now(), duration = 650;
      const tick = now => { const p = Math.min(1, (now - started) / duration); heroCount.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-IN"); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    } else heroCount.textContent = target.toLocaleString("en-IN");
  }

  const collectionShowing = document.getElementById("collectionShowing");
  if (collectionShowing) {
    const label = savedOnly ? "SAVED NOTES" : (term ? "SEARCH RESULTS" : (selectedClass !== "all" ? selectedClass.toUpperCase() : (selected !== "all" ? selected.toUpperCase() : (selectedTeacher !== "all" ? selectedTeacher.toUpperCase() : "ALL RESOURCES"))));
    collectionShowing.textContent = label;
  }
  const footerYear = document.getElementById("footerYear");
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  updateSavedControls();

  // Reset to page 1 on new filter
  currentPage = 1;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!filtered.length) {
    const hasFilters = term || selected !== "all" || selectedClass !== "all" || selectedTeacher !== "all";
    let emptyHtml = "";
    if (savedOnly) {
      emptyHtml = `<div class="empty-state">
        <span class="empty-state-icon" aria-hidden="true">♡</span>
        <h3>No saved notes yet</h3>
        <p>Save a note using the heart button on any note card, and it will appear here.</p>
        <button type="button" class="btn btn-secondary empty-action" onclick="document.getElementById('savedOnlyButton').click()">Back to library</button>
      </div>`;
    } else if (hasFilters) {
      emptyHtml = `<div class="empty-state">
        <span class="empty-state-icon" aria-hidden="true">⌕</span>
        <h3>No notes match your search</h3>
        <p>Try adjusting your filters or search term.</p>
        <button type="button" class="btn btn-secondary empty-action" id="clearAllFiltersBtn">Clear all filters</button>
      </div>`;
    } else {
      emptyHtml = `<div class="empty-state">
        <span class="empty-state-icon" aria-hidden="true">📂</span>
        <h3>No notes available yet</h3>
        <p>Check back soon — new study materials will appear here.</p>
      </div>`;
    }
    notesGrid.innerHTML = emptyHtml;
    document.getElementById("clearAllFiltersBtn")?.addEventListener("click", () => {
      if (searchInput)   searchInput.value   = "";
      if (subjectFilter) subjectFilter.value = "all";
      if (classFilter)   classFilter.value   = "all";
      if (teacherFilter) teacherFilter.value = "all";
      savedOnly = false;
      renderNotes();
    });
    renderPaginationControls(0, 0);
    return;
  }

  // ── Render cards ──────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  currentPage = Math.min(currentPage, totalPages);
  const pageNotes = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  notesGrid.innerHTML = pageNotes.map(n => {
    try {
      const isSaved = savedNoteIds.has(String(n.id));
      const col     = getSubjectColour(n.subject);
      const icon    = getSubjectIcon(n.subject);
      return `<article class="note-card" style="--card-bg:${col.bg};--card-border:${col.border};--card-icon:${col.icon}">
        <div class="note-card-content">
          <button type="button" class="bookmark-button ${isSaved ? "is-saved" : ""}" data-action="bookmark" data-id="${escapeHTML(String(n.id))}"
            aria-label="${isSaved ? "Remove saved note" : "Save note"}" aria-pressed="${isSaved}" title="${isSaved ? "Remove from saved notes" : "Save this note"}">${isSaved ? "♥" : "♡"}</button>
          <div class="subject-icon" aria-hidden="true" style="background:${col.bg};color:${col.icon};border:1px solid ${col.border}">${icon}</div>
          <span class="subject-tag" style="background:${col.bg};color:${col.icon};border:1px solid ${col.border}">${escapeHTML(n.subject)}</span>
          <h3>${escapeHTML(n.title)}</h3>
          <p class="note-filename">${n.teacher ? `Teacher: ${escapeHTML(n.teacher)} · ` : ""}${escapeHTML(n.fileName)}</p>
          <p class="note-date">Added ${formatDate(n.createdAt)}</p>
        </div>
        <div class="note-actions">
          <button type="button" class="btn btn-primary" data-action="read"     data-id="${escapeHTML(String(n.id))}">Read PDF</button>
          <button type="button" class="btn btn-secondary" data-action="download" data-id="${escapeHTML(String(n.id))}">Download</button>
          <button type="button" class="btn btn-icon" data-action="share"    data-id="${escapeHTML(String(n.id))}" title="Share note" aria-label="Share note">↗</button>
        </div>
      </article>`;
    } catch (err) {
      console.warn("Could not render note card", err);
      return "";
    }
  }).join("");

  renderPaginationControls(currentPage, totalPages);
  renderRecentlyViewed();
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function renderPaginationControls(page, total) {
  let el = document.getElementById("paginationControls");
  if (!el) {
    el = document.createElement("div");
    el.id = "paginationControls";
    el.className = "pagination-controls";
    notesGrid.after(el);
  }
  if (total <= 1) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <button class="page-btn" data-goto="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">‹ Prev</button>
    <span class="page-info">Page <b>${page}</b> of <b>${total}</b></span>
    <button class="page-btn" data-goto="${page + 1}" ${page >= total ? "disabled" : ""} aria-label="Next page">Next ›</button>`;
  el.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPage = Number(btn.dataset.goto);
      renderNotes();
      document.getElementById("library")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

// ─── Saved notes controls ─────────────────────────────────────────────────────
function updateSavedControls() {
  if (savedCount) savedCount.textContent = String(savedNoteIds.size);
  if (savedOnlyButton) {
    savedOnlyButton.setAttribute("aria-pressed", String(savedOnly));
    savedOnlyButton.classList.toggle("is-active", savedOnly);
    savedOnlyButton.innerHTML = `<span aria-hidden="true">${savedOnly ? "♥" : "♡"}</span> ${savedOnly ? "Showing saved" : "Saved notes"} <span class="saved-count">${savedNoteIds.size}</span>`;
  }
}

// ─── Notes grid click handler ─────────────────────────────────────────────────
notesGrid.addEventListener("click", e => {
  const btn = e.target.closest("button[data-action]"); if (!btn) return;
  const note = notes.find(n => String(n.id) === String(btn.dataset.id)); if (!note) return;

  if (btn.dataset.action === "bookmark") {
    const id = String(note.id);
    if (savedNoteIds.has(id)) savedNoteIds.delete(id); else savedNoteIds.add(id);
    if (!persistSavedNoteIds()) {
      if (savedNoteIds.has(id)) savedNoteIds.delete(id); else savedNoteIds.add(id);
      window.alert("Your browser could not save this note. Check that local storage is enabled.");
    }
    renderNotes();
    showToast(savedNoteIds.has(id) ? "Note saved on this device" : "Note removed from saved notes");
    return;
  }
  if (btn.dataset.action === "read")     openPDFReader(note);
  if (btn.dataset.action === "download") downloadNote(note);
  if (btn.dataset.action === "share")    shareNote(note);
});

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message) {
  let toast = document.getElementById("studyShelfToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "studyShelfToast";
    toast.className = "study-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

// ─── Download ─────────────────────────────────────────────────────────────────
function downloadNote(n) {
  const a = document.createElement("a");
  a.href = n.fileUrl; a.download = n.fileName || "study-notes.pdf";
  a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
}

// ─── PDF Reader ───────────────────────────────────────────────────────────────
function setReaderError(message) {
  readerLoading.hidden = true;
  readerError.hidden = false;
  readerErrorMessage.textContent = message || "The PDF could not be loaded. Check your connection and try again.";
}
function clearReader() {
  clearInstantZoomPreview();
  if (pageRenderObserver) { pageRenderObserver.disconnect(); pageRenderObserver = null; }
  pageRenderTasks.forEach(task => { try { task.cancel(); } catch (_) {} });
  pageRenderTasks.clear();
  thumbnailRenderTasks.forEach(task => { try { task.cancel(); } catch (_) {} });
  thumbnailRenderTasks.clear();
  pdfPages.innerHTML = "";
  thumbnailList.innerHTML = "";
  readerStage.classList.remove("is-zoomed");
  activePdf = null;
}
async function openPDFReader(note) {
  const token = ++readerOpenToken;
  if (activePdf) { try { activePdf.destroy(); } catch (_) {} }
  activeNote = note;
  activePdfUrl  = note.fileUrl;
  activePdfName = note.fileName || "study-notes.pdf";
  viewerTitle.textContent = note.title;
  readerMeta.textContent  = [note.className, note.subject, note.teacher ? `Teacher: ${note.teacher}` : ""].filter(Boolean).join(" · ") || "Your study document";
  openPdfExternal.href    = activePdfUrl;

  pdfViewer.classList.add("active");
  setReadingMode(false);
  pdfViewer.setAttribute("aria-hidden", "false");
  document.body.classList.add("reader-is-open");
  readerError.hidden   = true;
  readerLoading.hidden = false;
  readerLoading.querySelector("strong").textContent = "Preparing your document";
  readerLoading.querySelector("p").textContent      = "This may take a moment for large PDFs.";
  readerDownload.onclick = () => downloadNote(note);
  clearReader();
  readerStage.scrollTop = 0;
  currentPageInput.value = "1";
  readerStatus.textContent = "Loading document…";

  // Track recently viewed
  pushRecentNote(note.id);
  renderRecentlyViewed();

  // Open note link in URL
  const url = new URL(window.location.href.split("?")[0] + (window.location.search || ""));
  url.searchParams.set("note", String(note.id));
  history.replaceState(null, "", url.toString());

  try {
    if (!window.pdfjsLib) throw new Error("The PDF reader library did not load. Check your internet connection and reload the page.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const loadingTask = pdfjsLib.getDocument({ url: activePdfUrl, withCredentials: false });
    const pdf = await loadingTask.promise;
    if (token !== readerOpenToken) { pdf.destroy(); return; }
    activePdf = pdf;
    totalPagesLabel.textContent = String(pdf.numPages);
    currentPageInput.max = String(pdf.numPages);
    document.getElementById("thumbnailCount").textContent = `${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}`;
    readerLoading.hidden = true;
    readerError.hidden   = true;
    readerStatus.textContent = `${pdf.numPages} pages · PDF document`;

    for (let i = 1; i <= pdf.numPages; i++) {
      const section = document.createElement("section");
      section.className = "pdf-page-shell";
      section.id = `pdf-page-${i}`;
      section.dataset.page = String(i);
      section.setAttribute("aria-label", `Page ${i}`);
      const badge  = document.createElement("span"); badge.className = "page-number-badge"; badge.textContent = String(i);
      const canvas = document.createElement("canvas"); canvas.className = "pdf-page-canvas"; canvas.setAttribute("aria-label", `PDF page ${i}`);
      section.append(badge, canvas);
      pdfPages.appendChild(section);

      const thumb = document.createElement("button");
      thumb.type = "button"; thumb.className = "thumbnail-item"; thumb.dataset.page = String(i);
      thumb.setAttribute("aria-label", `Go to page ${i}`);
      thumb.innerHTML = `<span class="thumbnail-preview"><canvas></canvas><span>${i}</span></span><b>Page ${i}</b>`;
      thumb.addEventListener("click", () => goToPage(i));
      thumbnailList.appendChild(thumb);
    }

    setupPageObserver();
    await Promise.all([renderThumbnail(1), renderPage(1)]);
    if (token !== readerOpenToken) return;
    updateZoomDisplay();

    // Resume from last saved page
    const savedPage = getSavedPdfPage(note.id);
    setTimeout(() => {
      fitReaderToWidth();
      if (savedPage > 1) {
        setTimeout(() => goToPage(savedPage), 150);
      }
    }, 30);
  } catch (error) {
    if (token !== readerOpenToken) return;
    console.error("PDF reader error:", error);
    setReaderError(
      error?.message?.includes("CORS")
        ? "This file's storage settings are blocking the reader. Check Supabase Storage access and CORS settings."
        : (error?.message || "The PDF could not be loaded.")
    );
    readerStatus.textContent = "Unable to load PDF";
  }
}
function setupPageObserver() {
  if (pageRenderObserver) pageRenderObserver.disconnect();
  pageRenderObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const page = Number(entry.target.dataset.page);
        renderPage(page);
        renderThumbnail(page);
      }
    }
  }, { root: readerStage, rootMargin: "500px 0px", threshold: 0.01 });
  document.querySelectorAll(".pdf-page-shell").forEach(el => pageRenderObserver.observe(el));
}
async function renderPage(pageNum, force = false, scaleOverride = null, generation = null) {
  const pdfAtStart = activePdf;
  if (!pdfAtStart || pageNum < 1 || pageNum > pdfAtStart.numPages) return;
  const shell  = document.getElementById(`pdf-page-${pageNum}`);
  const canvas = shell?.querySelector("canvas");
  if (!canvas) return;
  let page;
  try { page = await pdfAtStart.getPage(pageNum); }
  catch (error) { if (pdfAtStart === activePdf) console.warn(`Could not load PDF page ${pageNum}`, error); return; }
  if (pdfAtStart !== activePdf) return;
  const base     = page.getViewport({ scale: 1 });
  const maxWidth = Math.max(280, readerStage.clientWidth - 64);
  const scale    = scaleOverride ?? (fitToWidth ? Math.min(2.4, maxWidth / base.width) : readerScale);
  const dpr      = Math.min(window.devicePixelRatio || 1, 2);
  const renderKey = `${scale.toFixed(3)}:${Math.round(maxWidth)}:${dpr}`;
  if (!force && canvas.dataset.renderKey === renderKey && shell.classList.contains("is-rendered")) return;
  if (!force && canvas.dataset.requestedRenderKey === renderKey) return;
  canvas.dataset.requestedRenderKey = renderKey;
  const existing = pageRenderTasks.get(pageNum);
  if (existing) { try { existing.cancel(); } catch (_) {} }
  const viewport = page.getViewport({ scale });
  const width = Math.floor(viewport.width), height = Math.floor(viewport.height);
  const stagingCanvas = document.createElement("canvas");
  stagingCanvas.width  = Math.max(1, Math.floor(viewport.width  * dpr));
  stagingCanvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  const ctx  = stagingCanvas.getContext("2d", { alpha: false });
  const task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
  pageRenderTasks.set(pageNum, task);
  try {
    await task.promise;
    if (pageRenderTasks.get(pageNum) !== task || pdfAtStart !== activePdf || (generation !== null && generation !== zoomGeneration)) return;
    shell.style.width   = `${width}px`;
    shell.style.height  = `${height}px`;
    shell.style.minHeight = `${height}px`;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width  = stagingCanvas.width;
    canvas.height = stagingCanvas.height;
    const visibleContext = canvas.getContext("2d", { alpha: false });
    visibleContext.drawImage(stagingCanvas, 0, 0);
    canvas.dataset.renderKey      = renderKey;
    canvas.dataset.renderedScale  = String(scale);
    canvas.dataset.paintedWidth   = String(width);
    canvas.dataset.paintedHeight  = String(height);
    shell.classList.add("is-rendered");
    if (canvas.dataset.requestedRenderKey === renderKey) delete canvas.dataset.requestedRenderKey;
    pageRenderTasks.delete(pageNum);
  } catch (error) {
    if (pageRenderTasks.get(pageNum) === task) pageRenderTasks.delete(pageNum);
    if (canvas.dataset.requestedRenderKey === renderKey) delete canvas.dataset.requestedRenderKey;
    if (error?.name !== "RenderingCancelledException") console.warn(`Could not render PDF page ${pageNum}`, error);
  }
}
async function renderThumbnail(pageNum) {
  const pdfAtStart = activePdf;
  if (!pdfAtStart) return;
  const button = thumbnailList.querySelector(`[data-page="${pageNum}"]`);
  const canvas = button?.querySelector("canvas");
  if (!canvas || canvas.dataset.rendered === "true" || canvas.dataset.rendering === "true") return;
  canvas.dataset.rendering = "true";
  let task = null;
  try {
    const page     = await pdfAtStart.getPage(pageNum);
    if (pdfAtStart !== activePdf || !canvas.isConnected) return;
    const viewport = page.getViewport({ scale: 0.19 });
    const width    = Math.max(1, Math.floor(viewport.width));
    const height   = Math.max(1, Math.floor(viewport.height));
    canvas.width  = width;
    canvas.height = height;
    const ctx  = canvas.getContext("2d");
    task = page.render({ canvasContext: ctx, viewport });
    thumbnailRenderTasks.set(pageNum, task);
    await task.promise;
    if (pdfAtStart === activePdf && canvas.isConnected) canvas.dataset.rendered = "true";
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") console.warn("Thumbnail could not be rendered", error);
  } finally {
    if (thumbnailRenderTasks.get(pageNum) === task) thumbnailRenderTasks.delete(pageNum);
    if (canvas.isConnected) delete canvas.dataset.rendering;
  }
}
function goToPage(page) {
  if (!activePdf) return;
  const n = Math.max(1, Math.min(activePdf.numPages, Number(page) || 1));
  const target = document.getElementById(`pdf-page-${n}`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    currentPageInput.value = String(n);
    document.querySelectorAll(".thumbnail-item").forEach(b => b.classList.toggle("is-current", Number(b.dataset.page) === n));
    // Save page position
    if (activeNote) savePdfPage(activeNote.id, n);
  }
}
function updateCurrentPage() {
  if (!activePdf) return;
  const shells    = [...document.querySelectorAll(".pdf-page-shell")];
  const stageRect = readerStage.getBoundingClientRect();
  let closest = 1, dist = Infinity;
  for (const shell of shells) {
    const r = shell.getBoundingClientRect();
    const d = Math.abs(r.top - stageRect.top - 20);
    if (d < dist) { dist = d; closest = Number(shell.dataset.page); }
  }
  currentPageInput.value = String(closest);
  document.querySelectorAll(".thumbnail-item").forEach(b => b.classList.toggle("is-current", Number(b.dataset.page) === closest));
  if (activeNote) savePdfPage(activeNote.id, closest);
}
function updateZoomDisplay() { zoomLevel.textContent = fitToWidth ? "Fit" : `${Math.round(readerScale * 100)}%`; }
function applyInstantZoomPreview(anchor = null) {
  if (!pdfPages) return;
  const base = Math.max(.01, lastZoomPaint || fitWidthScale || 1);
  const ratio = Math.max(.35, Math.min(4, readerScale / base));
  const pagesRect = pdfPages.getBoundingClientRect();
  const stageRect = readerStage.getBoundingClientRect();
  const x = anchor ? anchor.x - pagesRect.left : stageRect.width / 2;
  const y = anchor ? anchor.y - pagesRect.top  : readerStage.scrollTop;
  pdfPages.style.transformOrigin = `${x}px ${y}px`;
  pdfPages.style.transform       = `scale(${ratio})`;
}
function clearInstantZoomPreview() {
  pdfPages.style.transform       = "";
  pdfPages.style.transformOrigin = "";
}
async function renderZoomBatch(pageNumbers, targetScale, generation, pdfAtStart) {
  const jobs = pageNumbers.map(async pageNum => {
    const shell         = document.getElementById(`pdf-page-${pageNum}`);
    const visibleCanvas = shell?.querySelector("canvas");
    if (!shell || !visibleCanvas) return null;
    const page = await pdfAtStart.getPage(pageNum);
    if (generation !== zoomGeneration || pdfAtStart !== activePdf) return null;
    const base     = page.getViewport({ scale: 1 });
    const maxWidth = Math.max(280, readerStage.clientWidth - 64);
    const scale    = targetScale === null ? Math.min(2.4, maxWidth / base.width) : targetScale;
    const dpr      = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale });
    const staging  = document.createElement("canvas");
    staging.width  = Math.max(1, Math.floor(viewport.width  * dpr));
    staging.height = Math.max(1, Math.floor(viewport.height * dpr));
    const ctx  = staging.getContext("2d", { alpha: false });
    const task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    const old  = pageRenderTasks.get(pageNum);
    if (old) { try { old.cancel(); } catch (_) {} }
    pageRenderTasks.set(pageNum, task);
    try {
      await task.promise;
      if (pageRenderTasks.get(pageNum) !== task || generation !== zoomGeneration || pdfAtStart !== activePdf) return null;
      return { pageNum, shell, visibleCanvas, staging, width: Math.floor(viewport.width), height: Math.floor(viewport.height), scale, dpr, task };
    } catch (error) {
      if (error?.name !== "RenderingCancelledException") console.warn(`Could not render PDF page ${pageNum}`, error);
      return null;
    }
  });
  const results = await Promise.all(jobs);
  if (generation !== zoomGeneration || pdfAtStart !== activePdf) return;
  const ready = results.filter(Boolean);
  await new Promise(resolve => requestAnimationFrame(() => {
    if (generation !== zoomGeneration || pdfAtStart !== activePdf) { resolve(); return; }
    for (const { shell, visibleCanvas, staging, width, height, scale, task, pageNum } of ready) {
      shell.style.width    = `${width}px`;
      shell.style.height   = `${height}px`;
      shell.style.minHeight = `${height}px`;
      visibleCanvas.style.width  = `${width}px`;
      visibleCanvas.style.height = `${height}px`;
      visibleCanvas.width  = staging.width;
      visibleCanvas.height = staging.height;
      visibleCanvas.getContext("2d", { alpha: false }).drawImage(staging, 0, 0);
      visibleCanvas.dataset.renderKey    = `${scale.toFixed(3)}:${Math.round(Math.max(280, readerStage.clientWidth - 64))}:${ready[0]?.dpr ?? 1}`;
      visibleCanvas.dataset.renderedScale = String(scale);
      visibleCanvas.dataset.paintedWidth  = String(width);
      visibleCanvas.dataset.paintedHeight = String(height);
      shell.classList.add("is-rendered");
      if (pageRenderTasks.get(pageNum) === task) pageRenderTasks.delete(pageNum);
    }
    resolve();
  }));
}
function rerenderVisiblePages(anchor = null) {
  if (!activePdf) return;
  const pageNumbers = [...document.querySelectorAll(".pdf-page-shell")].filter(shell => {
    const r = shell.getBoundingClientRect();
    return r.bottom > -700 && r.top < readerStage.clientHeight + 700;
  }).map(shell => Number(shell.dataset.page));
  if (!pageNumbers.length) { const n = Number(currentPageInput.value) || 1; pageNumbers.push(n); }
  if (pageRenderObserver) { pageRenderObserver.disconnect(); pageRenderObserver = null; }
  if (!fitToWidth) applyInstantZoomPreview(anchor);
  const generation  = ++zoomGeneration;
  clearTimeout(zoomRenderTimer);
  const pdfAtStart = activePdf;
  zoomRenderTimer = setTimeout(async () => {
    await renderZoomBatch(pageNumbers, fitToWidth ? null : readerScale, generation, pdfAtStart);
    if (generation !== zoomGeneration || pdfAtStart !== activePdf) return;
    const first       = document.querySelector(`#pdf-page-${pageNumbers[0]} canvas`);
    const paintedScale = Number(first?.dataset.renderedScale);
    if (fitToWidth) { if (Number.isFinite(paintedScale) && paintedScale > 0) fitWidthScale = paintedScale; lastZoomPaint = fitWidthScale; }
    else lastZoomPaint = readerScale;
    clearInstantZoomPreview();
    updateReaderZoomLayout();
    if (anchor) keepZoomAnchor(anchor);
    updateZoomDisplay();
    if (pageRenderObserver) { pageRenderObserver.disconnect(); pageRenderObserver = null; }
    setupPageObserver();
  }, 0);
}
function updateReaderZoomLayout() {
  readerStage.classList.toggle("is-zoomed", !fitToWidth && readerScale > fitWidthScale + 0.015);
}
function fitReaderToWidth() {
  fitToWidth = true; readerScale = 1;
  clearInstantZoomPreview();
  updateReaderZoomLayout();
  rerenderVisiblePages();
}
function captureZoomAnchor(clientX = null, clientY = null) {
  const stageRect = readerStage.getBoundingClientRect();
  const x = Number.isFinite(clientX) ? clientX : stageRect.left + stageRect.width / 2;
  const y = Number.isFinite(clientY) ? clientY : stageRect.top  + stageRect.height / 2;
  let shell = null;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) shell = document.elementFromPoint(clientX, clientY)?.closest?.(".pdf-page-shell") || null;
  if (!shell) {
    const shells = [...pdfPages.querySelectorAll(".pdf-page-shell")];
    shell = shells.find(item => { const r = item.getBoundingClientRect(); return y >= r.top && y <= r.bottom; }) || shells[0] || null;
  }
  if (!shell) return { x, y, pageId: null, rx: 0.5, ry: 0.5 };
  const rect = shell.getBoundingClientRect();
  return { x, y, pageId: shell.id, rx: Math.max(0, Math.min(1, (x - rect.left) / Math.max(1, rect.width))), ry: Math.max(0, Math.min(1, (y - rect.top) / Math.max(1, rect.height))) };
}
function keepZoomAnchor(anchor) {
  if (!anchor) return;
  const shell = anchor.pageId ? document.getElementById(anchor.pageId) : null;
  if (!shell) return;
  const rect  = shell.getBoundingClientRect();
  readerStage.scrollLeft += rect.left + rect.width  * anchor.rx - anchor.x;
  readerStage.scrollTop  += rect.top  + rect.height * anchor.ry - anchor.y;
}
function changeZoom(delta, clientX = null, clientY = null) {
  const anchor = captureZoomAnchor(clientX, clientY);
  if (fitToWidth) { readerScale = lastZoomPaint || fitWidthScale || 1; fitToWidth = false; }
  const next = Math.max(.5, Math.min(3.5, readerScale + delta));
  if (next === readerScale) { updateReaderZoomLayout(); return; }
  fitToWidth = false; readerScale = next;
  updateReaderZoomLayout();
  rerenderVisiblePages(anchor);
  zoomLevel.textContent    = `${Math.round(readerScale * 100)}%`;
  readerStatus.textContent = `Zoom ${Math.round(readerScale * 100)}% · Hold Ctrl and scroll to adjust`;
}
function closePDFViewer() {
  readerOpenToken++;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  pdfViewer.classList.remove("reading-mode");
  pdfViewer.classList.remove("active");
  pdfViewer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("reader-is-open");
  if (activePdf) { try { activePdf.destroy(); } catch (_) {} }
  clearReader();
  readerLoading.hidden = false;
  readerError.hidden   = true;
  // Remove note param from URL
  const url = new URL(window.location.href);
  url.searchParams.delete("note");
  history.replaceState(null, "", url.toString());
}

// ─── Reader event listeners ───────────────────────────────────────────────────
closeViewer.addEventListener("click", closePDFViewer);
document.getElementById("prevPage").addEventListener("click",  () => goToPage(Number(currentPageInput.value) - 1));
document.getElementById("nextPage").addEventListener("click",  () => goToPage(Number(currentPageInput.value) + 1));
currentPageInput.addEventListener("change", () => goToPage(currentPageInput.value));
document.getElementById("zoomOut").addEventListener("click",   () => changeZoom(-.15));
document.getElementById("zoomIn").addEventListener("click",    () => changeZoom(.15));
document.getElementById("fitWidth").addEventListener("click",  fitReaderToWidth);

const thumbnailsToggle = document.getElementById("toggleThumbnails");
function setPagesSidebarHidden(hidden) {
  readerSidebar.classList.toggle("is-hidden", hidden);
  readerStage.classList.toggle("sidebar-hidden", hidden);
  thumbnailsToggle.setAttribute("aria-pressed",    String(!hidden));
  thumbnailsToggle.setAttribute("aria-label", hidden ? "Expand document pages" : "Collapse document pages");
  thumbnailsToggle.title      = hidden ? "Expand document pages" : "Collapse document pages";
  thumbnailsToggle.textContent = hidden ? "☷›" : "☷‹";
  setTimeout(() => { if (fitToWidth) fitReaderToWidth(); else rerenderVisiblePages(); }, 180);
}
thumbnailsToggle.addEventListener("click", () => setPagesSidebarHidden(!readerSidebar.classList.contains("is-hidden")));

const readingModeButton     = document.getElementById("readingModeButton");
const fullscreenButton      = document.getElementById("fullscreenButton");
const focusFullscreenButton = document.getElementById("focusFullscreenButton");
let readingModeHadHiddenSidebar = false;
function setReadingMode(enabled) {
  if (enabled) readingModeHadHiddenSidebar = readerSidebar.classList.contains("is-hidden");
  pdfViewer.classList.toggle("reading-mode", enabled);
  readingModeButton.setAttribute("aria-pressed", String(enabled));
  readingModeButton.innerHTML = enabled ? "▤ <span>Exit reading</span>" : "▤ <span>Reading mode</span>";
  if (enabled) setPagesSidebarHidden(true);
  else setPagesSidebarHidden(readingModeHadHiddenSidebar);
  setTimeout(() => { if (fitToWidth) fitReaderToWidth(); else rerenderVisiblePages(); }, 120);
}
readingModeButton.addEventListener("click", () => setReadingMode(!pdfViewer.classList.contains("reading-mode")));
document.getElementById("exitReadingMode").addEventListener("click", () => setReadingMode(false));

async function toggleReaderFullscreen() {
  try { if (!document.fullscreenElement) await pdfViewer.requestFullscreen(); else await document.exitFullscreen(); }
  catch (error) { readerStatus.textContent = "Full screen is not available in this browser."; }
}
fullscreenButton.addEventListener("click",      toggleReaderFullscreen);
focusFullscreenButton.addEventListener("click", toggleReaderFullscreen);
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  fullscreenButton.innerHTML      = active ? "⛶ <span>Exit full screen</span>" : "⛶ <span>Full screen</span>";
  focusFullscreenButton.textContent = active ? "⛶ Exit full screen" : "⛶ Full screen";
  setTimeout(() => { if (fitToWidth) fitReaderToWidth(); else rerenderVisiblePages(); }, 120);
});

let lastWheelClientX = null, lastWheelClientY = null;
readerStage.addEventListener("wheel", e => {
  if (!pdfViewer.classList.contains("active") || !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  lastWheelClientX = e.clientX; lastWheelClientY = e.clientY;
  queuedWheelDelta += e.deltaY;
  if (!zoomWheelFrame) zoomWheelFrame = requestAnimationFrame(() => {
    const delta = queuedWheelDelta; queuedWheelDelta = 0; zoomWheelFrame = 0;
    if (delta) changeZoom(Math.max(-.12, Math.min(.12, -delta * 0.0012)), lastWheelClientX, lastWheelClientY);
  });
}, { passive: false });

readerStage.addEventListener("scroll", () => { window.requestAnimationFrame(updateCurrentPage); }, { passive: true });
window.addEventListener("resize", () => {
  if (pdfViewer.classList.contains("active") && fitToWidth) {
    clearTimeout(window.__readerResizeTimer);
    window.__readerResizeTimer = setTimeout(() => rerenderVisiblePages(), 100);
  }
});
retryReader.addEventListener("click", () => { if (activeNote) openPDFReader(activeNote); });

// ─── Global keyboard shortcuts ────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  // PDF reader shortcuts
  if (e.key === "Escape" && pdfViewer.classList.contains("active")) { closePDFViewer(); return; }
  if (pdfViewer.classList.contains("active") && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) {
    if (e.key === "ArrowRight") goToPage(Number(currentPageInput.value) + 1);
    if (e.key === "ArrowLeft")  goToPage(Number(currentPageInput.value) - 1);
    if ((e.ctrlKey || e.metaKey) && e.key === "+") { e.preventDefault(); changeZoom(.15); }
    if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); changeZoom(-.15); }
    return;
  }

  // "/" or Ctrl+K → focus search box
  if (!pdfViewer.classList.contains("active") && searchInput) {
    const inInput = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
    if ((e.key === "/" && !inInput) || ((e.ctrlKey || e.metaKey) && e.key === "k")) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      document.getElementById("library")?.scrollIntoView({ behavior: "smooth" });
      showToast("Search focused — start typing");
    }
  }
});

// ─── Filter event listeners ───────────────────────────────────────────────────
searchButton.addEventListener("click", renderNotes);
searchInput.addEventListener("input",  renderNotes);
if (subjectFilter) subjectFilter.addEventListener("change", renderNotes);
if (teacherFilter) teacherFilter.addEventListener("change", renderNotes);
if (classFilter)   classFilter.addEventListener("change",   renderNotes);
sortFilter.addEventListener("change", renderNotes);
if (savedOnlyButton) savedOnlyButton.addEventListener("click", () => { savedOnly = !savedOnly; renderNotes(); });

// ─── Back to top ──────────────────────────────────────────────────────────────
updateSavedControls();
const backToTop = document.getElementById("backToTop");
if (backToTop) {
  const updateBackToTop = () => backToTop.classList.toggle("is-visible", window.scrollY > 500);
  window.addEventListener("scroll", updateBackToTop, { passive: true });
  updateBackToTop();
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
}

// ─── Sticky toolbar ───────────────────────────────────────────────────────────
(function setupStickyToolbar() {
  const toolbar = document.querySelector(".library-toolbar");
  if (!toolbar) return;
  const sentinel = document.createElement("div");
  sentinel.className = "toolbar-sentinel";
  toolbar.before(sentinel);
  const obs = new IntersectionObserver(([entry]) => {
    toolbar.classList.toggle("is-stuck", !entry.isIntersecting);
  }, { threshold: 0, rootMargin: "-84px 0px 0px 0px" });
  obs.observe(sentinel);
})();

// ─── Mobile nav ───────────────────────────────────────────────────────────────
(function setupMobileNav() {
  const toggleBtn = document.querySelector(".mobile-menu");
  if (!toggleBtn) return;

  // Build mobile nav overlay
  const overlay = document.createElement("div");
  overlay.id        = "mobileNavOverlay";
  overlay.className = "mobile-nav-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <nav class="mobile-nav" role="navigation" aria-label="Mobile navigation">
      <div class="mobile-nav-header">
        <span class="mobile-nav-brand">study<span>shelf</span></span>
        <button type="button" class="mobile-nav-close" aria-label="Close navigation">×</button>
      </div>
      <div class="mobile-nav-links">
        <a href="#library" class="mobile-nav-link">📚 Library</a>
        <a href="#about"   class="mobile-nav-link">ℹ️ About</a>
      </div>
      <div class="mobile-nav-footer">
        <a class="mobile-nav-cta" href="#library">Explore notes ↗</a>
      </div>
    </nav>`;
  document.body.appendChild(overlay);

  // Replace the ☰ onclick (remove inline handler)
  toggleBtn.removeAttribute("onclick");
  toggleBtn.setAttribute("aria-label", "Open navigation");
  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.setAttribute("aria-controls", "mobileNavOverlay");

  function openNav() {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.textContent = "×";
    document.body.style.overflow = "hidden";
    overlay.querySelector(".mobile-nav-close")?.focus();
  }
  function closeNav() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.textContent = "☰";
    document.body.style.overflow = "";
    toggleBtn.focus();
  }

  toggleBtn.addEventListener("click", () => overlay.classList.contains("is-open") ? closeNav() : openNav());
  overlay.querySelector(".mobile-nav-close").addEventListener("click", closeNav);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeNav(); });
  overlay.querySelectorAll(".mobile-nav-link, .mobile-nav-cta").forEach(link => {
    link.addEventListener("click", () => { closeNav(); });
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && overlay.classList.contains("is-open")) closeNav(); });
})();

// ─── Load notes ───────────────────────────────────────────────────────────────
async function loadNotes() {
  if (loadingNotes) return;
  loadingNotes = true;
  notesGrid.setAttribute("aria-busy", "true");
  showSkeletonCards(6);
  try {
    const { data, error } = await supabaseClient
      .from("notes")
      .select("id,title,subject,class_name,teacher,file_name,file_path,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    notes = (data || []).map(n => {
      const { data: p } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(n.file_path);
      return {
        id: n.id,
        title: n.title,
        subject: n.subject,
        className: n.class_name || "",
        teacher: n.teacher || "",
        fileName: n.file_name,
        filePath: n.file_path,
        fileUrl: p.publicUrl,
        createdAt: n.created_at,
      };
    });
    applyUrlState();
    updateClassFilter();
    updateSubjectFilter();
    updateTeacherFilter();
    renderNotes();
    renderRecentlyViewed();

    // Open note from URL if present
    const urlState = window.__pendingUrlState || readUrlState();
    if (urlState.note) {
      const targetNote = notes.find(n => String(n.id) === String(urlState.note));
      if (targetNote) setTimeout(() => openPDFReader(targetNote), 300);
    }
  } catch (e) {
    console.error(e);
    notesGrid.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon" aria-hidden="true">⚠️</span>
      <h3>Could not load notes</h3>
      <p>Check your connection and <button type="button" class="inline-link" onclick="location.reload()">try refreshing the page</button>.</p>
    </div>`;
    if (noteCount) noteCount.textContent = "0 notes";
  } finally {
    loadingNotes = false;
    notesGrid.setAttribute("aria-busy", "false");
  }
}

loadNotes();
