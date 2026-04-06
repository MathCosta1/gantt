// ========= Persistência & Constantes =========
const STORAGE_KEY = "ganttData_v25"; // bump when schema changes
const MAX_TOTAL_HEIGHT_PX = 700;
const DEFAULT_GRID_SCALE  = 2;
const MIN_INITIAL_VH      = 0.5; // 50% viewport for first render
const MS_DAY = 24 * 60 * 60 * 1000;
const THEMES_KEY = "ganttTheme_v1";

// ========= Estado =========
let data = { categories: [] };
let view = { startMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), months: 12, extraH: 0 };
let firstRenderBootstrap = true;

// dynamic palette (hex colors)
const DEFAULT_PALETTE = ['#FFB84D','#8DD36E','#FF8A4D','#4AA3DF','#E27FA9'];
let palette = DEFAULT_PALETTE.slice();

// ========= Utilitárias =========
const toDate = (s) => s ? new Date(`${s}T00:00:00`) : null;
const fmt = (d) => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function firstWeekStart(date){
  const d = new Date(date);
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  d.setHours(0,0,0,0);
  return d;
}
function addMonths(date, n){ const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }
function nearestMonday(d){
  const base = firstWeekStart(d);
  const next = new Date(base.getTime() + 7*MS_DAY);
  const distPrev = Math.abs(d - base);
  const distNext = Math.abs(next - d);
  return (distPrev <= distNext) ? base : next;
}

function setCellW(px){ document.documentElement.style.setProperty('--cell-w', `${px}px`); }
function getCellW(){ const v = getComputedStyle(document.documentElement).getPropertyValue('--cell-w'); return parseInt(v) || 64; }
function setRowH(px){ document.documentElement.style.setProperty('--row-h', `${px}px`); }
function getRowH(){ const v = getComputedStyle(document.documentElement).getPropertyValue('--row-h'); return parseInt(v) || 68; }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// returns a usable color string for CSS:
// - if name is a hex (#...), return it
// - if name matches barN, return the CSS var value
// - otherwise return the name (assume valid CSS color) or fallback to --bar1
function colorToHex(name){
  const fallback = getComputedStyle(document.documentElement).getPropertyValue('--bar1').trim() || '#4aa3df';
  if (!name) return fallback;
  if (typeof name !== 'string') return fallback;
  name = name.trim();
  if (name.startsWith('#')) return name;
  if (/^rgba?\(/i.test(name) || /^[a-z]+$/i.test(name)) return name;
  const cssVar = `--${name}`;
  const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return val || fallback;
}

// ========= Persistence (no DOM touches) =========
function saveState() {
  try {
    const ui = {};
    try { ui.cellW = getCellW(); } catch(e){ }
    try { ui.rowH = getRowH(); } catch(e){ }
    // persist palette as part of ui
    ui.palette = Array.isArray(palette) ? palette.slice() : DEFAULT_PALETTE.slice();
    ui.theme = currentTheme;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      data,
      view: {
        startMonth: view.startMonth instanceof Date ? view.startMonth.toISOString() : view.startMonth,
        months: view.months,
        extraH: view.extraH || 0
      },
      ui
    }));
  } catch (e) {
    console.warn('saveState failed', e);
  }
}
function loadRawState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e){
    console.warn('loadState failed', e);
    return null;
  }
}
function applyLoadedState(obj){
  if (!obj) return false;
  if (obj?.data?.categories) data = obj.data;
  if (obj?.view?.startMonth) view.startMonth = new Date(obj.view.startMonth);
  if (obj?.view?.months) view.months = obj.view.months;
  view.extraH = obj?.view?.extraH || 0;
  // palette
  if (obj?.ui?.palette && Array.isArray(obj.ui.palette) && obj.ui.palette.length) {
    palette = obj.ui.palette.slice();
  }
  return true;
}

// ========= DOM refs (assigned once DOM is ready) =========
let removeMode = false;

let themeToggleBtn, currentTheme;
let startMonthInput, monthsCountSelect, zoomSlider, rowHeightSlider, rowHeightValue;
let applyBtn, addTaskBtn, removeModeBtn;
let timeHeader, grid, gridResizer, todayLine, categoryList;
let toggleTodayLine, toggleAltRows;
let newCategoryNameInput, newCategoryColorSelect, addCategoryBtn;
let taskDialog, taskCategorySel, taskLabelInput, taskStartInput, taskEndInput, taskColorSel, taskLinkInput, submitTaskBtn;
let editTaskDialog, editTaskLabelInput, editTaskStartInput, editTaskEndInput, editTaskColorSel, editTaskLinkInput, confirmEditTaskBtn;
let editingTaskId = null;

function wireDomRefs(){
  themeToggleBtn   = document.getElementById("themeToggleBtn") || null;
  currentTheme     = (document.body.classList.contains("theme-light") ? "light" : "dark");

  startMonthInput   = document.getElementById("startMonth");
  monthsCountSelect = document.getElementById("monthsCount");
  zoomSlider        = document.getElementById("zoomSlider");
  rowHeightSlider   = document.getElementById("rowHeightSlider");
  rowHeightValue    = document.getElementById("rowHeightValue");
  applyBtn          = document.getElementById("applyView");

  addTaskBtn        = document.getElementById("addTaskBtn");
  removeModeBtn     = document.getElementById("removeModeBtn");

  timeHeader        = document.getElementById("time-header");
  grid              = document.getElementById("gantt-grid");
  gridResizer       = document.getElementById("grid-resizer");
  todayLine         = document.getElementById("today-line");
  categoryList      = document.getElementById("categoryList");

  toggleTodayLine   = document.getElementById("toggleTodayLine");
  toggleAltRows     = document.getElementById("toggleAltRows");

  newCategoryNameInput = document.getElementById("newCategoryName");
  newCategoryColorSelect= document.getElementById("newCategoryColor"); // can be <select> or <input type="color">
  addCategoryBtn       = document.getElementById("addCategoryBtn");

  taskDialog        = document.getElementById("taskDialog");
  taskCategorySel   = document.getElementById("taskCategory");
  taskLabelInput    = document.getElementById("taskLabel");
  taskStartInput    = document.getElementById("taskStart");
  taskEndInput      = document.getElementById("taskEnd");
  taskColorSel      = document.getElementById("taskColor"); // can be <select> or <input type="color">
  taskLinkInput     = document.getElementById("taskLink");
  submitTaskBtn     = document.getElementById("submitTask");

  editTaskDialog    = document.getElementById("editTaskDialog");
  editTaskLabelInput= document.getElementById("editTaskLabel");
  editTaskStartInput= document.getElementById("editTaskStart");
  editTaskEndInput  = document.getElementById("editTaskEnd");
  editTaskColorSel  = document.getElementById("editTaskColor"); // color input in edit dialog
  editTaskLinkInput = document.getElementById("editTaskLink");
  confirmEditTaskBtn= document.getElementById("confirmEditTask");
}

// populate a <select> element with current palette and an "add" option
function renderColorSelect(selectEl, selectedValue) {
  if (!selectEl) return;
  // if element is <input type="color"> do nothing more here
  if (selectEl.tagName.toLowerCase() !== 'select') return;

  selectEl.innerHTML = '';

  // ensure a visible square and centered content
  selectEl.style.width = selectEl.style.width || '44px';
  selectEl.style.height = selectEl.style.height || '36px';
  selectEl.style.padding = selectEl.style.padding || '4px';
  selectEl.style.borderRadius = selectEl.style.borderRadius || '8px';
  selectEl.style.textAlign = 'center';
  selectEl.style.lineHeight = selectEl.style.height;
  selectEl.style.minWidth = '44px';
  selectEl.style.cursor = 'pointer';

  // default selected color
  const cur = (selectedValue && typeof selectedValue === 'string') ? selectedValue : (palette[0] || '#4aa3df');

  palette.forEach((hex) => {
    const opt = document.createElement('option');
    opt.value = hex;
    // show a dot; option dot color shows in dropdown
    opt.textContent = '●';
    opt.style.color = hex;
    opt.title = hex;
    if (selectedValue && selectedValue.toLowerCase() === hex.toLowerCase()) opt.selected = true;
    selectEl.appendChild(opt);
  });

  const addOpt = document.createElement('option');
  addOpt.value = '__add__';
  addOpt.textContent = 'Adicionar cor...';
  selectEl.appendChild(addOpt);

  // style the select box to reflect current color with a centered white dot
  selectEl.style.backgroundColor = cur;
  selectEl.style.color = '#ffffff';
  selectEl.style.border = selectEl.style.border || '1px solid rgba(0,0,0,0.08)';

  // ensure when user opens dropdown and picks a color (or __add__), we react
  selectEl.onchange = (e) => {
    const val = selectEl.value;
    if (val === '__add__') {
      promptAddColor((hex) => {
        // after user picks, re-render this select and set bg to chosen color
        renderColorSelect(selectEl, hex || (palette[0] || '#4aa3df'));
      });
    } else {
      // set the selected color as background immediately
      selectEl.style.backgroundColor = val || (palette[0] || '#4aa3df');
      selectEl.style.color = '#fff';
    }
  };
}

// helper to prompt user to pick a color and add to palette
function promptAddColor(afterAddCallback) {
  const input = document.createElement('input');
  input.type = 'color';
  // default to first palette color
  input.value = palette[0] || '#4aa3df';
  input.style.position = 'fixed';
  input.style.left = '-10000px';
  document.body.appendChild(input);
  // use 'change' so the native picker stays open until the user confirms a color
  input.addEventListener('change', () => {
    const hex = input.value;
    if (hex && !palette.includes(hex)) {
      palette.unshift(hex); // add to start
      saveState();
    }
    if (typeof afterAddCallback === 'function') afterAddCallback(hex);
    input.remove();
  }, { once: true });
  // open native color picker
  input.click();
}

// ========= Theme & view syncing =========
function setTheme(theme){
  currentTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("theme-light", currentTheme === "light");
  document.body.classList.toggle("theme-dark",  currentTheme === "dark");
  document.getElementById("themeToggleBtn").textContent = currentTheme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEMES_KEY, theme);
}
function syncViewInputs(){
  if (!startMonthInput || !monthsCountSelect || !rowHeightValue || !rowHeightSlider) return;
  startMonthInput.value   = `${view.startMonth.getFullYear()}-${String(view.startMonth.getMonth()+1).padStart(2,"0")}`;
  monthsCountSelect.value = String(view.months);
  const currentRowH = getRowH();
  rowHeightSlider.value = currentRowH;
  rowHeightValue.textContent = `${currentRowH} px`;
}

// ========= Meses / semanas =========
function computeMonthsAndWeeks(startMonthDate, monthsCount){
  const months = [];
  for(let i=0; i<monthsCount; i++){
    const mStart = addMonths(new Date(startMonthDate), i);
    const firstDayOfMonth = new Date(mStart.getFullYear(), mStart.getMonth(), 1);
    const lastDayOfMonth  = new Date(mStart.getFullYear(), mStart.getMonth()+1, 0);
    let wStart = firstWeekStart(firstDayOfMonth);
    const weeks = [];
    while (wStart <= lastDayOfMonth) {
      weeks.push(new Date(wStart));
      wStart = new Date(wStart.getTime() + 7*MS_DAY);
    }
    months.push({ start: mStart, end: lastDayOfMonth, weeks });
  }
  return months;
}

// ========= Rows ↔ tasks helpers =========
function buildRowMap(){
  const map = [];
  (data.categories || []).forEach((c, ci) => {
    (c.tasks || []).forEach((task, ti) => {
      const start = toDate(task.start) || new Date(0);
      map.push({ ci, ti, id: task.id, start });
    });
  });
  map.sort((a,b) => {
    const d = a.start - b.start;
    if (d !== 0) return d;
    // stable tiebreaker: category index then task index
    if (a.ci !== b.ci) return a.ci - b.ci;
    return a.ti - b.ti;
  });
  return map;
}
function totalRows(){ return buildRowMap().length; }
function rowCenterTop(ri){
  const rowH = getRowH();
  const barH = 24;
  const offset = Math.max(4, Math.round((rowH - barH)/2));
  return (ri * rowH) + offset;
}
function moveTaskToRow(taskId, targetRow){
  let map = buildRowMap();
  const origRow = map.findIndex(m => (data.categories[m.ci].tasks[m.ti].id === taskId));
  if (origRow < 0) return;
  const orig = map[origRow];
  const task = data.categories[orig.ci].tasks.splice(orig.ti, 1)[0];
  map = buildRowMap();

  if (map.length === 0){
    if (!data.categories[orig.ci]) data.categories[orig.ci] = { title: "Módulo", color: null, tasks: [] };
    if (!data.categories[orig.ci].tasks) data.categories[orig.ci].tasks = [];
    data.categories[orig.ci].tasks.push(task);
    saveState(); render(); return;
  }
  if (targetRow >= map.length){
    const lastCi = map[map.length-1].ci;
    data.categories[lastCi].tasks.push(task);
  } else if (targetRow <= 0){
    const dest = map[0];
    data.categories[dest.ci].tasks.splice(dest.ti, 0, task);
  } else {
    const dest = map[targetRow];
    data.categories[dest.ci].tasks.splice(dest.ti, 0, task);
  }
  saveState(); render();
}

// ========= Helper: center/scroll to a task =========
function centerOnTask(taskId){
  const found = findTaskById(taskId);
  if (!found) return;
  const task = found.task;
  const taskStart = toDate(task.start) || new Date();
  const monthsInfo = computeMonthsAndWeeks(view.startMonth, view.months);
  const timelineStart = monthsInfo[0].start;
  const timelineEnd   = monthsInfo[monthsInfo.length-1].end;
  if (taskStart < timelineStart || taskStart > timelineEnd) {
    view.startMonth = new Date(taskStart.getFullYear(), taskStart.getMonth(), 1);
    render();
  }
  const bar = grid.querySelector(`.task-bar[data-id="${taskId}"]`);
  if (!bar) return;
  const targetX = bar.offsetLeft - (grid.clientWidth / 2) + (bar.offsetWidth / 2);
  grid.scrollLeft = Math.max(0, Math.round(targetX));
  const targetY = parseFloat(bar.style.top) - (grid.clientHeight / 2) + (bar.offsetHeight / 2);
  grid.scrollTop = Math.max(0, Math.round(targetY));
  bar.style.outline = "2px solid var(--accent)";
  setTimeout(()=> bar.style.outline = "", 800);
}

// ========= Render principal =========
function render(){
  if (!timeHeader || !grid || !categoryList) return;
  timeHeader.innerHTML = "";
  grid.innerHTML = "";
  grid.appendChild(todayLine);
  grid.appendChild(gridResizer);

  // Sidebar: Módulos list with swatch and task checklist (now collapsible)
  categoryList.innerHTML = data.categories && data.categories.length
    ? data.categories.map((c, idx) => {
        if (!c.color && (c.tasks && c.tasks.length)) c.color = c.tasks[0].color || null;
        const catColorHex = colorToHex(c.color || palette[0] || '#4aa3df');
        const tasksHtml = (c.tasks || []).map((t, ti) => {
          const checked = t.done ? 'checked' : '';
          return `<label class="sidebar-task-row" data-ci="${idx}" data-ti="${ti}">
                    <input type="checkbox" class="task-check" data-ci="${idx}" data-ti="${ti}" ${checked}>
                    <span class="task-label ${t.done ? 'done' : ''}" title="${escapeHtml(t.label || '')}">${escapeHtml(t.label)}</span>
                  </label>`;
        }).join("");

        // collapsed state persisted on category: c.collapsed (boolean)
        const collapsedClass = c.collapsed ? 'collapsed' : '';
        const aria = c.collapsed ? 'false' : 'true';
        return `
          <li class="module-item ${collapsedClass}" data-ci="${idx}">
            <div class="module-head">
              <span class="category-title" title="${escapeHtml(c.title || '')}" style="color:${catColorHex}">
                <span class="category-swatch" style="background:${catColorHex}"></span>
                <span class="category-title-text">${escapeHtml(c.title)}</span>
              </span>
              <div class="module-actions">
                <button class="cat-del-btn" data-ci="${idx}" title="Remove module">×</button>
              </div>
            </div>
            <div class="module-tasks">${tasksHtml}</div>
          </li>`;
      }).join("")
    : `<li style="color:var(--text-muted)">Sem módulos. Adicione um módulo ao lado.</li>`;

  const monthsInfo = computeMonthsAndWeeks(view.startMonth, view.months);
  const cellW = getCellW();

  const monthRow = document.createElement("div");
  monthRow.className = "month-row";
  monthRow.style.gridTemplateColumns = monthsInfo.map(m => `${m.weeks.length * cellW}px`).join(" ");
  monthsInfo.forEach(m => {
    const cell = document.createElement("div");
    cell.className = "month-cell";
    cell.textContent = m.start.toLocaleString("pt-BR", { month: "long" }).replace(/^./, s=>s.toUpperCase());
    monthRow.appendChild(cell);
  });
  timeHeader.appendChild(monthRow);

  const weekRow = document.createElement("div");
  weekRow.className = "week-row";
  weekRow.style.gridTemplateColumns = monthsInfo.map(m => m.weeks.map(_ => `${cellW}px`).join(" ")).join(" ");
  monthsInfo.forEach(m => {
    m.weeks.forEach((_, wi) => {
      const cell = document.createElement("div");
      cell.className = "week-cell";
      cell.textContent = `W${wi+1}`;
      weekRow.appendChild(cell);
    });
  });
  timeHeader.appendChild(weekRow);

  const allWeeks = [];
  monthsInfo.forEach(m => m.weeks.forEach(w => {
    const wEnd = new Date(w.getTime() + 7*MS_DAY - 1);
    allWeeks.push({ start: new Date(w), end: wEnd });
  }));

  const rowH = getRowH();
  const rows = totalRows();
  const baseHeight = rows * rowH + 24;
  if (firstRenderBootstrap) {
    const minNeeded = Math.max(0, (window.innerHeight * MIN_INITIAL_VH) - baseHeight);
    const scaleExtra = Math.max(0, (DEFAULT_GRID_SCALE - 1) * baseHeight);
    view.extraH = Math.max(scaleExtra, minNeeded);
    firstRenderBootstrap = false;
  }
  const desiredTotal = baseHeight + (view.extraH || 0);
  let totalHeight  = Math.min(desiredTotal, MAX_TOTAL_HEIGHT_PX);
  if (desiredTotal > MAX_TOTAL_HEIGHT_PX) {
    view.extraH = Math.max(0, MAX_TOTAL_HEIGHT_PX - baseHeight);
    totalHeight = MAX_TOTAL_HEIGHT_PX;
  }
  grid.style.height   = `${totalHeight}px`;
  grid.style.minWidth = `${allWeeks.length * cellW}px`;
  grid.classList.toggle("alt-rows", toggleAltRows ? toggleAltRows.checked : true);

  for (let i = 0; i < rows; i++){
    const bg = document.createElement("div");
    bg.className = "row-bg";
    bg.style.top = `${i*rowH}px`;
    grid.appendChild(bg);
  }

  const timelineStart = allWeeks[0].start.getTime();
  const timelineEnd   = allWeeks[allWeeks.length-1].end.getTime();
  const msPerPixel    = (7*MS_DAY) / cellW;

  const xFromDateStr = (dateStr) => Math.max(0,
    Math.min((timelineEnd - timelineStart)/msPerPixel, (toDate(dateStr).getTime() - timelineStart) / msPerPixel));
  const dateStrFromX = (x) => {
    const ms = timelineStart + x * msPerPixel;
    const d = new Date(ms); d.setHours(0,0,0,0); return ymd(d);
  };

  const map = buildRowMap();
  map.forEach((entry, rowIndex) => {
    const cat = data.categories[entry.ci];
    const task = (cat && cat.tasks && cat.tasks[entry.ti]) ? cat.tasks[entry.ti] : null;
    if (!task) return;
    const x    = xFromDateStr(task.start);
    const xEnd = xFromDateStr(task.end);
    const width= Math.max(14, xEnd - x);

    const bar = document.createElement("div");
    bar.className = "task-bar";
    bar.dataset.color    = task.color || cat.color || palette[0] || "bar1";
    bar.dataset.id       = task.id;
    bar.dataset.rowIndex = String(rowIndex);
    bar.dataset.ci       = String(entry.ci);
    bar.dataset.ti       = String(entry.ti);
    bar.style.left  = `${x}px`;
    bar.style.top   = `${rowCenterTop(rowIndex)}px`;
    bar.style.width = `${width}px`;
    bar.title = `${task.label} • ${fmt(toDate(task.start))} → ${fmt(toDate(task.end))}`;

    const labelSpan = document.createElement("span");
    labelSpan.className = "bar-label";
    labelSpan.textContent = task.label;

    labelSpan.addEventListener("click", (ev) => {
      ev.stopPropagation();
      centerOnTask(task.id);
    });

    const linkBtn = document.createElement("a");
    linkBtn.className = "bar-link";
    const link = (task.link || "").trim();
    if (link) {
      linkBtn.href = link; linkBtn.target = "_blank"; linkBtn.rel = "noopener noreferrer"; linkBtn.title = "Abrir link";
    } else { linkBtn.classList.add("disabled"); linkBtn.title = "Sem link"; linkBtn.href = "javascript:void(0)"; }
    linkBtn.addEventListener("click", (e) => e.stopPropagation());

    bar.appendChild(labelSpan);
    bar.appendChild(linkBtn);

    let colorVal = '';
    const chosen = task.color || cat.color || palette[0] || 'bar4';
    if (typeof chosen === 'string' && chosen.trim().startsWith('#')) {
      colorVal = chosen.trim();
    } else {
      const cssVar = '--' + (chosen || 'bar4');
      colorVal = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || colorToHex(chosen);
    }
    if (colorVal) bar.style.backgroundColor = colorVal;

    grid.appendChild(bar);

    // No render(), dentro do loop onde as barras são criadas, adicione a classe se a tarefa estiver concluída:
    if (task.done) {
      bar.classList.add('task-done');
    } else {
      bar.classList.remove('task-done');
    }

    const EDGE = 14;
    const edgeRole = (ev) => {
      const rect = bar.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      if (px <= EDGE) return "resize-left";
      if (px >= rect.width - EDGE) return "resize-right";
      return "drag";
    };
    const updateHoverCursor = (ev) => {
      const role = edgeRole(ev);
      bar.style.cursor = (role === "drag") ? "grab" : "ew-resize";
      bar.classList.toggle("resize-edge-left",  role === "resize-left");
      bar.classList.toggle("resize-edge-right", role === "resize-right");
    };
    bar.addEventListener("mousemove", updateHoverCursor);
    bar.addEventListener("mouseleave", () => {
      bar.style.cursor = "default";
      bar.classList.remove("resize-edge-left", "resize-edge-right");
    });

    let clickTimer = null;
    let downPos = null;
    bar.addEventListener("mousedown", (e) => { downPos = { x: e.clientX, y: e.clientY }; });
    bar.addEventListener("click", (e) => {
      if (removeMode || e.target.closest(".bar-link")) return;
      const url = (task.link || "").trim();
      if (!url) return;
      const upPos = { x: e.clientX, y: e.clientY };
      const moved = downPos ? (Math.abs(upPos.x - downPos.x) > 3 || Math.abs(upPos.y - downPos.y) > 3) : false;
      if (moved) { downPos = null; return; }
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
      clickTimer = setTimeout(() => { window.open(url, "_blank", "noopener,noreferrer"); clickTimer = null; }, 220);
    });
    bar.addEventListener("dblclick", () => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      if (removeMode) return;
      editingTaskId = task.id;
      editTaskLabelInput.value = task.label;
      editTaskStartInput.value = task.start;
      editTaskEndInput.value   = task.end;
      if (editTaskColorSel) {
        try {
          if (editTaskColorSel.type === 'color') {
            editTaskColorSel.value = (task.color && task.color.startsWith('#')) ? task.color : (palette[0] || '#000000');
          } else {
            renderColorSelect(editTaskColorSel, task.color);
          }
        } catch(e){}
      }
      editTaskLinkInput.value  = task.link || "";
      openDialog(editTaskDialog);
    });

    bar.addEventListener("mousemove", (ev) => {
      let tip = bar._tip;
      if(!tip){
        tip = document.createElement("div");
        tip.className = "tooltip";
        tip.textContent = `${task.label}: ${fmt(toDate(task.start))} → ${fmt(toDate(task.end))}${task.link ? " • 🔗" : ""}`;
        grid.appendChild(tip);
        bar._tip = tip;
      }
      tip.style.left = `${ev.pageX - grid.getBoundingClientRect().left}px`;
      tip.style.top  = `${bar.getBoundingClientRect().top - grid.getBoundingClientRect().top - 8}px`;
    });
    bar.addEventListener("mouseleave", () => { if(bar._tip){ bar._tip.remove(); bar._tip = null; } });

    let dragState = null;

    bar.addEventListener("mousedown", (e) => {
      if (removeMode){
        e.preventDefault();
        if(confirm(`Remover tarefa "${task.label}"?`)){ deleteTaskById(task.id); }
        return;
      }
      const role = edgeRole(e);
      if (e.detail === 2) return;

      dragState = {
        role,
        startX: e.clientX, startY: e.clientY,
        origLeft: parseFloat(bar.style.left),
        origTop:  parseFloat(bar.style.top),
        origWidth:parseFloat(bar.style.width),
        id: task.id
      };

      if (role === "drag"){
        document.addEventListener("mousemove", onDragMove);
        document.addEventListener("mouseup",   onDragUp);
      } else {
        document.addEventListener("mousemove", onResizeMove);
        document.addEventListener("mouseup",   onResizeUp);
      }
    });

    function onDragMove(e){
      if(!dragState) return;
      const dx = e.clientX - dragState.startX;
      let newLeft = dragState.origLeft + dx;
      newLeft = Math.max(0, Math.min(newLeft, grid.scrollWidth - dragState.origWidth));
      bar.style.cursor = "grabbing";
      bar.style.left = `${newLeft}px`;
      bar.style.top = `${dragState.origTop}px`;
      const gr = grid.getBoundingClientRect();
      if(e.clientX > gr.right - 30) grid.scrollLeft += 20;
      if(e.clientX < gr.left  + 30) grid.scrollLeft -= 20;
    }

    function onDragUp(){
      if(!dragState) return;
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup",   onDragUp);
      const newLeft  = parseFloat(bar.style.left);
      const newWidth = parseFloat(bar.style.width);
      const newStart = dateStrFromX(newLeft);
      const newEnd   = dateStrFromX(newLeft + newWidth);
      updateTaskDates(dragState.id, newStart, newEnd);
      bar.style.cursor = "default";
      bar.style.top = `${dragState.origTop}px`;
      dragState = null;
    }

    function onResizeMove(e){
      if(!dragState) return;
      const dx = e.clientX - dragState.startX;
      if(dragState.role === "resize-left"){
        let newLeft  = dragState.origLeft + dx;
        let newWidth = dragState.origWidth - dx;
        if(newWidth < 14){ newWidth = 14; newLeft = dragState.origLeft + dragState.origWidth - 14; }
        if(newLeft < 0){  newLeft = 0;  newWidth = dragState.origLeft + dragState.origWidth; }
        bar.style.left  = `${newLeft}px`;
        bar.style.width = `${newWidth}px`;
      } else {
        let newWidth = dragState.origWidth + dx;
        if(newWidth < 14) newWidth = 14;
        const maxWidth = grid.scrollWidth - dragState.origLeft;
        if(newWidth > maxWidth) newWidth = maxWidth;
        bar.style.width = `${newWidth}px`;
      }
    }
    function onResizeUp(){
      if(!dragState) return;
      document.removeEventListener("mousemove", onResizeMove);
      document.removeEventListener("mouseup",   onResizeUp);
      const newLeft  = parseFloat(bar.style.left);
      const newWidth = parseFloat(bar.style.width);
      const newStart = dateStrFromX(newLeft);
      const newEnd   = dateStrFromX(newLeft + newWidth);
      updateTaskDates(dragState.id, newStart, newEnd);
      dragState = null;
    }

    // Novo: editar tarefa com clique direito
    bar.addEventListener("contextmenu", (e) => {
      e.preventDefault(); // previne menu padrão
      editingTaskId = task.id;
      // preenche o diálogo de edição
      editTaskLabelInput.value = task.label;
      editTaskStartInput.value = task.start;
      editTaskEndInput.value   = task.end;
      if (editTaskColorSel) {
        try {
          if (editTaskColorSel.type === 'color') {
            editTaskColorSel.value = (task.color && task.color.startsWith('#')) ? task.color : (palette[0] || '#000000');
          } else if (editTaskColorSel.tagName.toLowerCase() === 'select') {
            renderColorSelect(editTaskColorSel, task.color);
          }
        } catch(e){}
      }
      editTaskLinkInput.value = task.link || '';
      // abre o diálogo
      const supportsDialog = typeof HTMLDialogElement === "function" && typeof editTaskDialog?.showModal === "function";
      if (supportsDialog) {
        editTaskDialog.showModal();
      } else {
        editTaskDialog.classList.add("open");
      }
    });
  });

  const firstWeek = firstWeekStart(monthsInfo[0].start);
  if (todayLine) {
    todayLine.style.display = toggleTodayLine ? (toggleTodayLine.checked ? "block" : "none") : "block";
    const today = new Date();
    const todayX = (nearestMonday(today).getTime() - firstWeek.getTime()) / ((7*MS_DAY)/getCellW());
    todayLine.style.left = `${todayX}px`;
  }

  if (taskCategorySel) {
    const options = (data.categories || []).map((c, idx) => `<option value="${idx}">${escapeHtml(c.title)}</option>`).join("");
    taskCategorySel.innerHTML = options;
  }

  saveState();
}

function showToast(message, type = "info", duration = 2800) {
  const toastArea = document.getElementById("toastArea");
  if (!toastArea) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  t.setAttribute("role", "status");
  toastArea.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .2s ease, transform .2s ease";
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 220);
  }, duration);
}

function quickActionFeedback(selector, text) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener("click", () => showToast(text, "success"));
}

quickActionFeedback("#addCategoryBtn", "Module added");
quickActionFeedback("#addTaskBtn", "Task dialog opened");
quickActionFeedback("#removeModeBtn", "Remove mode toggled");
quickActionFeedback("#themeToggleBtn", "Theme updated");

// right-click hint:
const board = document.querySelector(".board");
if (board) board.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".task-bar")) showToast("Right-click . task to edit", "info");
});

// marca todas as tarefas do módulo ci como concluídas
function markModuleComplete(ci) {
  if (!Array.isArray(data.categories) || ci < 0 || ci >= data.categories.length) return;
  const cat = data.categories[ci];
  if (!Array.isArray(cat.tasks)) cat.tasks = [];
  cat.tasks.forEach(t => t.done = true);
  saveState();
  render(); // manter Gantt sincronizado
  renderTrainingChecklist();
  try { localStorage.setItem('ganttData_lastUpdate', Date.now().toString()); } catch(e){}
}

// limpa o estado "done" de todas as tarefas do módulo ci
function clearModuleProgress(ci) {
  if (!Array.isArray(data.categories) || ci < 0 || ci >= data.categories.length) return;
  const cat = data.categories[ci];
  if (!Array.isArray(cat.tasks)) cat.tasks = [];
  cat.tasks.forEach(t => t.done = false);
  saveState();
  render();
  renderTrainingChecklist();
  try { localStorage.setItem('ganttData_lastUpdate', Date.now().toString()); } catch(e){}
}

function renderTrainingChecklist(){
  const root = document.getElementById('training-checklist');
  if (!root) return;
  root.innerHTML = '';
  if (!data.categories || !data.categories.length) {
    root.innerHTML = '<div>Nenhum módulo</div>';
    return;
  }
  data.categories.forEach((c, ci) => {
    const total = (c.tasks || []).length;
    const done = (c.tasks || []).filter(t => t.done).length;
    const moduleDiv = document.createElement('div');
    moduleDiv.style.padding = '8px 0';
    moduleDiv.innerHTML = `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" data-ci="${ci}" id="modchk-${ci}" ${total>0 && done===total ? 'checked' : ''}>
        <label for="modchk-${ci}" style="font-weight:700;color:var(--text-strong)">${escapeHtml(c.title || 'Módulo')}</label>
        <span style="margin-left:6px;color:var(--text-muted);font-size:13px">${done}/${total}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="mark-complete" data-ci="${ci}" title="Marcar todas como concluídas" style="font-size:12px;padding:4px 8px">Marcar completo</button>
        <button class="mark-clear" data-ci="${ci}" title="Limpar" style="font-size:12px;padding:4px 8px">Limpar</button>
      </div>
    </div>`;
    const ul = document.createElement('div');
    ul.style.paddingLeft = '26px';
    (c.tasks || []).forEach((t, ti) => {
      const taskRow = document.createElement('div');
      taskRow.style.display = 'flex';
      taskRow.style.alignItems = 'center';
      taskRow.style.gap = '8px';
      taskRow.style.padding = '6px 0';
      taskRow.innerHTML = `<input type="checkbox" data-ci="${ci}" data-ti="${ti}" id="task-${ci}-${ti}" ${t.done ? 'checked' : ''}>
        <label for="task-${ci}-${ti}" style="${t.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${escapeHtml(t.label || 'Tarefa')}</label>`;
      ul.appendChild(taskRow);
    });
    moduleDiv.appendChild(ul);
    root.appendChild(moduleDiv);
  });
}

function injectTrainingChecklist(){
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  if (document.getElementById('training-card')) return;

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'training-card';
  card.innerHTML = `
    <h3>Progresso</h3>
    <div id="training-checklist" style="font-size:14px;color:var(--text-muted)"></div>
  `;
  const modulesCard = sidebar.querySelector('.card');
  if (modulesCard && modulesCard.nextSibling) {
    sidebar.insertBefore(card, modulesCard.nextSibling);
  } else {
    sidebar.appendChild(card);
  }
  renderTrainingChecklist();

  // delegação: escuta cliques nos botões e mudanças nos checkboxes
  const root = card.querySelector('#training-checklist');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const ci = parseInt(btn.dataset.ci, 10);
    if (btn.classList.contains('mark-complete')) {
      markModuleComplete(ci);
    } else if (btn.classList.contains('mark-clear')) {
      clearModuleProgress(ci);
    }
  });

  root.addEventListener('change', (e) => {
    const cb = e.target;
    if (!cb || cb.tagName.toLowerCase() !== 'input' || cb.type !== 'checkbox') return;
    const ci = cb.dataset.ci ? parseInt(cb.dataset.ci, 10) : null;
    const ti = cb.dataset.ti ? parseInt(cb.dataset.ti, 10) : null;
    if (ci === null || Number.isNaN(ci)) return;
    if (ti === null || Number.isNaN(ti)){
      const allChecked = cb.checked;
      (data.categories[ci].tasks || []).forEach(t => t.done = !!allChecked);
    } else {
      const task = data.categories[ci].tasks[ti];
      if (task) task.done = !!cb.checked;
    }
    saveState();
    render();
    renderTrainingChecklist();
    try { localStorage.setItem('ganttData_lastUpdate', Date.now().toString()); } catch(e){}
  });

  window.addEventListener('storage', (ev) => {
    if (ev.key === STORAGE_KEY || ev.key === 'ganttData_lastUpdate') renderTrainingChecklist();
  });
}

// ========= Find / Update utilities =========
function findTaskById(taskId){
  for(let ci=0; ci<(data.categories || []).length; ci++){
    const cat = data.categories[ci];
    for(let ti=0; ti<(cat.tasks||[]).length; ti++){
      if(cat.tasks[ti].id === taskId) return { ci, ti, task: cat.tasks[ti] };
    }
  }
  return null;
}
function updateTaskDates(taskId, startStr, endStr){
  const x = findTaskById(taskId);
  if(!x) return;
  let s = toDate(startStr), e = toDate(endStr);
  if(!s || !e) return;
  if(e < s){ const tmp = s; s = e; e = tmp; startStr = ymd(s); endStr = ymd(e); }
  x.task.start = startStr; x.task.end = endStr;
  saveState(); render();
}
function addNewTask({categoryIndex, label, start, end, color, link}){
  if (Number.isNaN(categoryIndex) || categoryIndex < 0 || categoryIndex >= (data.categories||[]).length){
    alert("Selecione um módulo válido para adicionar a tarefa.");
    return;
  }
  const id = "t" + Math.random().toString(36).slice(2, 9);
  const cat = data.categories[categoryIndex];
  if(!cat.tasks) cat.tasks = [];
  const assignedColor = cat.color || color || palette[0] || '#4aa3df';
  cat.tasks.push({ id, label, start, end, color: assignedColor, link: link || "" });
  if (!cat.color) cat.color = assignedColor;
  saveState(); render();
}
function deleteTaskById(taskId){
  const x = findTaskById(taskId);
  if(!x) return;
  data.categories[x.ci].tasks.splice(x.ti, 1);
  saveState(); render();
}
function removeCategory(ci){
  if (ci < 0 || ci >= data.categories.length) return;
  data.categories.splice(ci, 1);
  saveState(); render();
}

// ========= Event wiring (after DOM ready) =========
function wireCategoryControls(){
  if (!newCategoryNameInput || !addCategoryBtn) {
    console.warn("⚠️ newCategoryName or addCategoryBtn not found.");
    return;
  }

  addCategoryBtn.replaceWith(addCategoryBtn.cloneNode(true));
  addCategoryBtn = document.getElementById("addCategoryBtn");

  const addCategory = () => {
    const name = (newCategoryNameInput?.value || "").trim();
    if (!name) { alert("Digite um nome para o módulo."); newCategoryNameInput?.focus(); return; }
    if (!Array.isArray(data.categories)) data.categories = [];
    const exists = data.categories.some(c => (c?.title || "").toLowerCase() === name.toLowerCase());
    if (exists) { alert("Já existe um módulo com esse nome."); newCategoryNameInput?.focus(); return; }
    let color = null;
    if (newCategoryColorSelect) {
      try {
        if (newCategoryColorSelect.tagName.toLowerCase() === 'select') {
          const val = newCategoryColorSelect.value;
          if (val === '__add__') {
            // prompt color then add category after user picks
            promptAddColor((hex) => {
              color = hex || palette[0] || '#4aa3df';
              data.categories.push({ title: name, color, tasks: [] });
              saveState(); render();
            });
            return;
          } else {
            color = val || null;
          }
        } else if (newCategoryColorSelect.type === 'color') {
          color = newCategoryColorSelect.value || null;
        }
      } catch(e){}
    }
    data.categories.push({ title: name, color, tasks: [] });
    newCategoryNameInput.value = "";
    if (newCategoryColorSelect) {
      try { if (newCategoryColorSelect.type === 'color') newCategoryColorSelect.value = palette[0] || '#4aa3df'; } catch(e){}
    }
    saveState(); render();
  };

  addCategoryBtn.addEventListener("click", addCategory);
  newCategoryNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } });

  // if newCategoryColorSelect is a select, render palette and handle add action
  if (newCategoryColorSelect && newCategoryColorSelect.tagName.toLowerCase() === 'select') {
    renderColorSelect(newCategoryColorSelect);
    newCategoryColorSelect.addEventListener('change', (e) => {
      if (e.target.value === '__add__') {
        promptAddColor((hex) => {
          renderColorSelect(newCategoryColorSelect, hex);
        });
      }
    });
  }
}

function wireGlobalControls(){
  if (startMonthInput) startMonthInput.addEventListener("change", () => {
    const [y, m] = startMonthInput.value.split("-").map(Number);
    view.startMonth = new Date(y, m-1, 1);
    render();
  });
  if (monthsCountSelect) monthsCountSelect.addEventListener("change", () => { view.months = parseInt(monthsCountSelect.value, 10); render(); });
  if (applyBtn) applyBtn.addEventListener("click", () => { render(); });

  if (toggleTodayLine) toggleTodayLine.addEventListener("change", () => { render(); });
  if (toggleAltRows) toggleAltRows.addEventListener("change", () => { render(); });

  if (zoomSlider) zoomSlider.addEventListener("input", () => { setCellW(parseInt(zoomSlider.value,10)); render(); });
  if (rowHeightSlider) rowHeightSlider.addEventListener("input", () => {
    const px = parseInt(rowHeightSlider.value, 10);
    setRowH(px);
    rowHeightValue && (rowHeightValue.textContent = `${px} px`);
    render();
    saveState();
  });

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      setTheme(currentTheme === "light" ? "dark" : "light");
      saveState();
    });
  }

  if (removeModeBtn) {
    removeModeBtn.addEventListener("click", () => {
      removeMode = !removeMode;
      removeModeBtn.textContent = removeMode ? "Remover (ativo)" : "Remover item";
      removeModeBtn.classList.toggle("primary", removeMode);
    });
  }

  // Category list delegation: handle delete and task select -> scroll to task (and adjust view if needed)
  if (categoryList) {
    // unified delegation: clicks (toggle/delete/title) and changes (checkboxes)
    categoryList.addEventListener("click", (e) => {
      // delete module
      const delBtn = e.target.closest(".cat-del-btn");
      if (delBtn) {
        const ci = parseInt(delBtn.dataset.ci, 10);
        const name = data.categories[ci]?.title || "módulo";
        if (confirm(`Remover o módulo "${name}" e todos os itens dele?`)) removeCategory(ci);
        return;
      }

      // toggle via toggle button
      const toggleBtn = e.target.closest(".module-toggle");
      if (toggleBtn) {
        const ci = parseInt(toggleBtn.dataset.ci, 10);
        if (!Number.isNaN(ci) && data.categories[ci]) {
          data.categories[ci].collapsed = !data.categories[ci].collapsed;
          saveState();
          render();
        }
        return;
      }

      // allow clicking the title area to toggle as well
      const titleEl = e.target.closest(".category-title");
      if (titleEl) {
        const li = titleEl.closest('.module-item');
        if (!li) return;
        const ci = parseInt(li.dataset.ci, 10);
        if (!Number.isNaN(ci) && data.categories[ci]) {
          data.categories[ci].collapsed = !data.categories[ci].collapsed;
          saveState();
          render();
        }
        return;
      }
    });

    categoryList.addEventListener("change", (e) => {
      // sidebar task checkbox change -> toggle done flag
      const cb = e.target.closest && e.target.closest('.task-check') ? e.target.closest('.task-check') : (e.target.classList && e.target.classList.contains('.task-check') ? e.target : null);
      if (cb) {
        const ci = parseInt(cb.dataset.ci, 10);
        const ti = parseInt(cb.dataset.ti, 10);
        if (!Number.isNaN(ci) && !Number.isNaN(ti) && data.categories[ci] && data.categories[ci].tasks[ti]) {
          data.categories[ci].tasks[ti].done = !!cb.checked;
          saveState();
          render(); // keep gantt synced
          renderTrainingChecklist();
          try { localStorage.setItem('ganttData_lastUpdate', Date.now().toString()); } catch(e){}
        }
      }
    });

    // Novo: clique direito para editar módulo na sidebar
    categoryList.addEventListener("contextmenu", (e) => {
      const moduleItem = e.target.closest('.module-item');
      if (moduleItem) {
        e.preventDefault(); // previne menu padrão
        const ci = parseInt(moduleItem.dataset.ci, 10);
        if (!Number.isNaN(ci) && data.categories[ci]) {
          const cat = data.categories[ci];
          const newTitle = prompt("Edit module name:", cat.title || "");
          if (newTitle !== null && newTitle.trim()) {
            cat.title = newTitle.trim();
            // Para cor, use um prompt simples ou selecione; aqui uso prompt para simplicidade
            const newColor = prompt("Edit module color (bar1 to bar5):", cat.color || "bar4");
            if (newColor && ["bar1", "bar2", "bar3", "bar4", "bar5"].includes(newColor)) {
              cat.color = newColor;
            }
            saveState();
            render();
          }
        }
      }
    });
  }

  const supportsDialog = typeof HTMLDialogElement === "function" && typeof taskDialog?.showModal === "function";
  function openDialog(d){ supportsDialog ? d.showModal() : d.classList.add("open"); }
  function closeDialog(d){ supportsDialog ? d.close()     : d.classList.remove("open"); }

  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", () => {
      if (!data.categories || data.categories.length === 0) {
        alert("Primeiro crie um módulo na barra lateral para adicionar tarefas.");
        newCategoryNameInput?.focus();
        return;
      }
      const today = new Date();
      taskLabelInput.value = "";
      const s = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      taskStartInput.value = ymd(s);
      taskEndInput.value   = ymd(new Date(s.getTime() + 14*MS_DAY));
      taskLinkInput.value  = "";
      const options = (data.categories || []).map((c, idx) => `<option value="${idx}">${escapeHtml(c.title)}</option>`).join("");
      taskCategorySel.innerHTML = options;
      if (taskCategorySel.options.length) {
        taskCategorySel.selectedIndex = 0;
        const cat = data.categories[0];
        const catColor = cat && cat.color ? cat.color : '';
        if (taskColorSel) {
          try {
            if (taskColorSel.type === 'color' && (typeof catColor === 'string' && catColor.startsWith('#'))) {
              taskColorSel.value = catColor;
              taskColorSel.disabled = false;
            } else if (taskColorSel.tagName.toLowerCase() === 'select') {
              renderColorSelect(taskColorSel, catColor);
              taskColorSel.disabled = false;
            } else {
              taskColorSel.value = catColor || palette[0] || '#4aa3df';
              taskColorSel.disabled = false;
            }
          } catch(e){}
        }
      } else if (taskColorSel) {
        taskColorSel.disabled = false;
      }
      openDialog(taskDialog);
    });
  }
  if (submitTaskBtn) {
    submitTaskBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const categoryIndex = parseInt(taskCategorySel.value, 10);
      const label = taskLabelInput.value.trim();
      const start = taskStartInput.value;
      const end   = taskEndInput.value;
      const cat = data.categories[categoryIndex];
      const colorFromInput = taskColorSel ? (taskColorSel.tagName.toLowerCase() === 'select' ? taskColorSel.value : taskColorSel.value) : undefined;
      const color = (cat && cat.color) || colorFromInput || palette[0] || '#4aa3df';
      const link  = (taskLinkInput.value || "").trim();
      if(!label || !start || !end || Number.isNaN(categoryIndex)){ return; }
      addNewTask({categoryIndex, label, start, end, color, link});
      closeDialog(taskDialog);
    });
  }

  if (taskCategorySel && taskColorSel) {
    taskCategorySel.addEventListener('change', () => {
      const idx = parseInt(taskCategorySel.value, 10);
      const cat = data.categories[idx];
      if (cat && cat.color) {
        try {
          if (taskColorSel.type === 'color' && typeof cat.color === 'string' && cat.color.startsWith('#')) {
            taskColorSel.value = cat.color;
            taskColorSel.disabled = false;
          } else if (taskColorSel.tagName.toLowerCase() === 'select') {
            renderColorSelect(taskColorSel, cat.color);
            taskColorSel.disabled = false;
          } else {
            taskColorSel.value = cat.color || palette[0] || '#4aa3df';
            taskColorSel.disabled = false;
          }
        } catch(e){}
      }
      else { taskColorSel.disabled = false; }
    });

    // if taskColorSel is select, support add color option
    if (taskColorSel.tagName && taskColorSel.tagName.toLowerCase() === 'select') {
      renderColorSelect(taskColorSel);
      taskColorSel.addEventListener('change', (e) => {
        if (e.target.value === '__add__') {
          promptAddColor((hex) => {
            renderColorSelect(taskColorSel, hex);
          });
        }
      });
    }
  }

  if (confirmEditTaskBtn) {
    confirmEditTaskBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      if(!editingTaskId) return;
      const x = findTaskById(editingTaskId);
      if(!x) return;
      const newLabel = editTaskLabelInput.value.trim();
      const newStart = editTaskStartInput.value;
      const newEnd   = editTaskEndInput.value;
      const newColor = editTaskColorSel ? (editTaskColorSel.tagName.toLowerCase() === 'select' ? editTaskColorSel.value : editTaskColorSel.value) : undefined;
      const newLink  = (editTaskLinkInput.value || "").trim();

      if (newLabel) x.task.label = newLabel;
      if (newColor) x.task.color = newColor;
      x.task.link = newLink;

      if (newStart && newEnd) {
        let s = toDate(newStart), e = toDate(newEnd);
        if (e < s) { const tmp = s; s = e; e = tmp; }
        x.task.start = ymd(s);
        x.task.end   = ymd(e);
      }

      editingTaskId = null;
      saveState(); render();
      closeDialog(editTaskDialog);
    });
  }
}

// Agrupa inputs "Novo módulo" + "Cor" num contêiner estilizável (executar após DOM existir)
function enhanceAddModuleLayout() {
  try {
    const nameEl = document.getElementById('newCategoryName');
    const colorEl = document.getElementById('newCategoryColor');
    const addBtn  = document.getElementById('addCategoryBtn');
    if (!nameEl || !addBtn) return;
    if (nameEl.closest('.add-module')) return;

    const parent = nameEl.parentNode || addBtn.parentNode;
    if (!parent) return;

    // remove explicit label "Cor" ou nós de texto com esse conteúdo (mais robusto)
    try {
      // remove labels apontando para o control
      const lbl = parent.querySelector('label[for="newCategoryColor"], .color-label');
      if (lbl) lbl.remove();

      // remove qualquer nó de texto isolado com o texto "Cor" (maiúsc/minúsc)
      Array.from(parent.childNodes).forEach(n => {
        if (n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim().toLowerCase() === 'cor') {
          n.remove();
        }
        // elementos que contenham apenas "Cor"
        if (n.nodeType === Node.ELEMENT_NODE && n.textContent && n.textContent.trim().toLowerCase() === 'cor') {
          n.remove();
        }
      });
    } catch(e){ /* ignore */ }

    const wrapper = document.createElement('div');
    wrapper.className = 'add-module';

    const colorWrap = document.createElement('div');
    colorWrap.className = 'color-wrap';

    // move elementos para o novo wrapper
    wrapper.appendChild(nameEl);
    if (colorEl) {
      colorWrap.appendChild(colorEl);
      wrapper.appendChild(colorWrap);
      // initialize visual for select/color control
      try {
        if (colorEl.tagName && colorEl.tagName.toLowerCase() === 'select') {
          renderColorSelect(colorEl, colorEl.value || (palette[0] || '#4aa3df'));
        } else if (colorEl.type === 'color') {
          colorEl.style.width = '44px';
          colorEl.style.height = '36px';
          colorEl.style.padding = '4px';
          colorEl.style.borderRadius = '8px';
          colorEl.style.border = '1px solid rgba(0,0,0,0.06)';
          colorEl.style.background = colorEl.value || (palette[0] || '#4aa3df');
        }
      } catch(e){}
    }

    const actions = document.createElement('div');
    actions.className = 'add-module-actions';
    actions.appendChild(addBtn);

    // insert in DOM and center the whole block
    parent.insertBefore(wrapper, parent.firstChild);
    parent.insertBefore(actions, wrapper.nextSibling);

    // keep color square in sync when user picks a color from <input type="color">
    if (colorEl && colorEl.type === 'color') {
      colorEl.addEventListener('input', () => {
        try { colorEl.style.background = colorEl.value; } catch(e){}
      });
    }
  } catch (e) {
    console.warn('enhanceAddModuleLayout failed', e);
  }
}

// chamar no init() depois que os refs forem amarrados
function init(){
  wireDomRefs();

  const loadedObj = loadRawState();
  const loaded = applyLoadedState(loadedObj);
  firstRenderBootstrap = !loaded;

  if (loadedObj?.ui?.cellW) setCellW(loadedObj.ui.cellW);
  if (loadedObj?.ui?.rowH) setRowH(loadedObj.ui.rowH);
  if (loadedObj?.ui?.palette && Array.isArray(loadedObj.ui.palette)) palette = loadedObj.ui.palette.slice();
  if (toggleTodayLine && typeof loadedObj?.ui?.showToday !== "undefined") toggleTodayLine.checked = !!loadedObj.ui.showToday;
  if (toggleAltRows && typeof loadedObj?.ui?.altRows === "boolean") toggleAltRows.checked = loadedObj.ui.altRows;
  if (loadedObj?.ui?.theme) setTheme(loadedObj.ui.theme);

  syncViewInputs();

  wireCategoryControls();
  wireGlobalControls();

  // reorganiza visual do formulário de adicionar módulo
  enhanceAddModuleLayout();

  if (!data.categories || data.categories.length === 0) {
    data.categories = [
      { title: 'Onboarding', color: palette[0] || '#4aa3df', tasks: [
        { id: 't1', label: 'Introdução', start: getISODateOffset(0), end: getISODateOffset(2), color: palette[0] || '#4aa3df', link: '' },
      ]},
      { title: 'Segurança', color: palette[1] || '#ffb84d', tasks: [] }
    ];
  }

  setCellW(parseInt(zoomSlider?.value, 10) || getCellW());
  setRowH(parseInt(rowHeightSlider?.value, 10) || getRowH());
  rowHeightValue && (rowHeightValue.textContent = `${getRowH()} px`);

  // if selects exist, render palette
  if (newCategoryColorSelect && newCategoryColorSelect.tagName.toLowerCase() === 'select') renderColorSelect(newCategoryColorSelect);
  if (taskColorSel && taskColorSel.tagName && taskColorSel.tagName.toLowerCase() === 'select') renderColorSelect(taskColorSel);
  if (editTaskColorSel && editTaskColorSel.tagName && editTaskColorSel.tagName.toLowerCase() === 'select') renderColorSelect(editTaskColorSel);

  render();
}

function getISODateOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0,10);
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

const applyTheme = (theme) => {
  body.classList.toggle("theme-dark", theme === "dark");
  body.classList.toggle("theme-light", theme === "light");
  toggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, theme);
};

toggleBtn.addEventListener("click", () => {
  applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "light" : "dark");
});