
// ========= Persistência =========
const STORAGE_KEY = "ganttData_v25"; // chave isolada

// Limites & escala
const MAX_TOTAL_HEIGHT_PX = 2400;
const DEFAULT_GRID_SCALE  = 2;
const MIN_INITIAL_VH      = 0.5; // mínimo de 50% da altura da tela
const MS_DAY = 24 * 60 * 60 * 1000;

// ========= Estado =========
// Começa vazio (sem exemplo)
let data = { categories: [] };
let view = { startMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), months: 12, extraH: 0 };

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      data,
      view: {
        startMonth: view.startMonth.toISOString(),
        months: view.months,
        extraH: view.extraH || 0
      },
      ui: {
        cellW: getCellW(),
        rowH: getRowH(),
        showToday: toggleTodayLine.checked,
        altRows: toggleAltRows ? !!toggleAltRows.checked : true,
        theme: currentTheme
      }
    })
  );
}
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj?.data?.categories) data = obj.data;
    if (obj?.view?.startMonth) view.startMonth = new Date(obj.view.startMonth);
    if (obj?.view?.months) view.months = obj.view.months;
    view.extraH = obj?.view?.extraH || 0;
    if (obj?.ui?.cellW) setCellW(obj.ui.cellW);
    if (obj?.ui?.rowH) setRowH(obj.ui.rowH);
    toggleTodayLine.checked = !!obj?.ui?.showToday;
    if (typeof obj?.ui?.altRows === "boolean" && toggleAltRows) toggleAltRows.checked = obj.ui.altRows;
    if (obj?.ui?.theme) setTheme(obj.ui.theme);
    return obj;
  } catch(e) { console.error("Erro ao ler storage:", e); return null; }
}
const loaded = loadState();
let firstRenderBootstrap = !loaded;

// ========= Utilidades =========
const toDate = (s) => new Date(`${s}T00:00:00`);
const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
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

// ========= Elementos/UI =========
let removeMode = false;

const themeToggleBtn   = document.getElementById("themeToggleBtn") || null;
let currentTheme       = (document.body.classList.contains("theme-light") ? "light" : "dark");

const startMonthInput   = document.getElementById("startMonth");
const monthsCountSelect = document.getElementById("monthsCount");
const zoomSlider        = document.getElementById("zoomSlider");
const rowHeightSlider   = document.getElementById("rowHeightSlider");
const rowHeightValue    = document.getElementById("rowHeightValue");

const applyBtn          = document.getElementById("applyView");

const addTaskBtn        = document.getElementById("addTaskBtn");
const removeModeBtn     = document.getElementById("removeModeBtn");

const timeHeader        = document.getElementById("time-header");
const grid              = document.getElementById("gantt-grid");
const gridResizer       = document.getElementById("grid-resizer");
const todayLine         = document.getElementById("today-line");
const categoryList      = document.getElementById("categoryList");

const toggleTodayLine   = document.getElementById("toggleTodayLine");
const toggleAltRows     = document.getElementById("toggleAltRows");

const newCategoryNameInput = document.getElementById("newCategoryName");
const addCategoryBtn       = document.getElementById("addCategoryBtn");

const taskDialog        = document.getElementById("taskDialog");
const taskCategorySel   = document.getElementById("taskCategory");
const taskLabelInput    = document.getElementById("taskLabel");
const taskStartInput    = document.getElementById("taskStart");
const taskEndInput      = document.getElementById("taskEnd");
const taskColorSel      = document.getElementById("taskColor");
const taskLinkInput     = document.getElementById("taskLink");
const submitTaskBtn     = document.getElementById("submitTask");

const editTaskDialog    = document.getElementById("editTaskDialog");
const editTaskLabelInput= document.getElementById("editTaskLabel");
const editTaskStartInput= document.getElementById("editTaskStart");
const editTaskEndInput  = document.getElementById("editTaskEnd");
const editTaskColorSel  = document.getElementById("editTaskColor");
const editTaskLinkInput = document.getElementById("editTaskLink");
const confirmEditTaskBtn= document.getElementById("confirmEditTask");
let editingTaskId = null;

// ========= Tema / Inputs =========
function setTheme(theme){
  currentTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("theme-light", currentTheme === "light");
  document.body.classList.toggle("theme-dark",  currentTheme === "dark");
  if (themeToggleBtn) {
    if (currentTheme === "light"){
      themeToggleBtn.textContent = "☀️";
      themeToggleBtn.setAttribute("aria-pressed", "false");
      themeToggleBtn.title = "Alternar para modo noturno";
    } else {
      themeToggleBtn.textContent = "🌙";
      themeToggleBtn.setAttribute("aria-pressed", "true");
      themeToggleBtn.title = "Alternar para modo claro";
    }
  }
}
function syncViewInputs(){
  startMonthInput.value   = `${view.startMonth.getFullYear()}-${String(view.startMonth.getMonth()+1).padStart(2,"0")}`;
  monthsCountSelect.value = String(view.months);
  const currentRowH = getRowH();
  rowHeightSlider.value = currentRowH;
  rowHeightValue.textContent = `${currentRowH} px`;
}
syncViewInputs();

/* Meses/Semanas por mês */
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

/* ===== Linhas ↔ tarefas (flatten) ===== */
function buildRowMap(){
  const map = [];
  data.categories.forEach((c, ci) => { (c.tasks || []).forEach((_, ti) => map.push({ ci, ti })); });
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
    if (!data.categories[orig.ci]) data.categories[orig.ci] = { title: "Categoria", color: null, tasks: [] };
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

// ========= Render principal =========
function render(){
  timeHeader.innerHTML = "";
  grid.innerHTML = "";
  grid.appendChild(todayLine);
  grid.appendChild(gridResizer);

  // Painel de categorias
  categoryList.innerHTML = data.categories.length
    ? data.categories.map((c, idx) => {
        if (!c.color && (c.tasks && c.tasks.length)) c.color = c.tasks[0].color || "bar1";
        const catColorHex = colorToHex(c.color || "bar1");
        const options = (c.tasks || []).map(t => {
          const optColor = colorToHex(t.color || "bar1");
          return `<option value="${t.id}" style="color:${optColor}">● ${escapeHtml(t.label)}</option>`;
        }).join("");
        return `
          <li>
            <span class="category-title" style="color:${catColorHex}">${escapeHtml(c.title)}</span>
            <select class="cat-task-select" data-ci="${idx}">
              <option value="">— Clique —</option>
              ${options}
            </select>
            <button class="cat-del-btn" data-ci="${idx}" title="Remover categoria">×</button>
          </li>`;
      }).join("")
    : `<li style="color:var(--text-muted)">Sem categorias. Adicione uma ao lado.</li>`;

  // Cabeçalho de tempo
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

  // Semanas contínuas
  const allWeeks = [];
  monthsInfo.forEach(m => m.weeks.forEach(w => {
    const wEnd = new Date(w.getTime() + 7*MS_DAY - 1);
    allWeeks.push({ start: new Date(w), end: wEnd });
  }));

  // Altura do grid (≥ 50vh na primeira render)
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
  const totalHeight  = Math.min(desiredTotal, MAX_TOTAL_HEIGHT_PX);
  if (desiredTotal > MAX_TOTAL_HEIGHT_PX) {
    view.extraH = Math.max(0, MAX_TOTAL_HEIGHT_PX - baseHeight);
  }
  grid.style.height   = `${totalHeight}px`;
  grid.style.minWidth = `${allWeeks.length * cellW}px`;
  grid.classList.toggle("alt-rows", toggleAltRows ? toggleAltRows.checked : true);

  // Fundo de linhas (uma por tarefa)
  for (let i = 0; i < rows; i++){
    const bg = document.createElement("div");
    bg.className = "row-bg";
    bg.style.top = `${i*rowH}px`;
    grid.appendChild(bg);
  }

  // Tempo ↔ pixel
  const timelineStart = allWeeks[0].start.getTime();
  const timelineEnd   = allWeeks[allWeeks.length-1].end.getTime();
  const msPerPixel    = (7*MS_DAY) / cellW;

  const xFromDateStr = (dateStr) => Math.max(0,
    Math.min((timelineEnd - timelineStart)/msPerPixel, (toDate(dateStr).getTime() - timelineStart) / msPerPixel));
  const dateStrFromX = (x) => {
    const ms = timelineStart + x * msPerPixel;
    const d = new Date(ms); d.setHours(0,0,0,0); return ymd(d);
  };

  // Render de barras
  let currentRowIndex = 0;
  data.categories.forEach((cat, ci) => {
    (cat.tasks || []).forEach((t, ti) => {
      const rowIndex = currentRowIndex++;
      const x    = xFromDateStr(t.start);
      const xEnd = xFromDateStr(t.end);
      const width= Math.max(14, xEnd - x);

      const bar = document.createElement("div");
      bar.className = "task-bar";
      bar.dataset.color    = t.color || "bar1";
      bar.dataset.id       = t.id;
      bar.dataset.rowIndex = String(rowIndex);
      bar.dataset.ci       = String(ci);
      bar.dataset.ti       = String(ti);
      bar.style.left  = `${x}px`;
      bar.style.top   = `${rowCenterTop(rowIndex)}px`;
      bar.style.width = `${width}px`;
      bar.title = `${t.label} • ${fmt(toDate(t.start))} → ${fmt(toDate(t.end))}`;

      const labelSpan = document.createElement("span");
      labelSpan.className = "bar-label";
      labelSpan.textContent = t.label;

      const linkBtn = document.createElement("a");
      linkBtn.className = "bar-link";
      const link = (t.link || "").trim();
      if (link) {
        linkBtn.href = link; linkBtn.target = "_blank"; linkBtn.rel = "noopener noreferrer"; linkBtn.title = "Abrir link";
      } else { linkBtn.classList.add("disabled"); linkBtn.title = "Sem link"; linkBtn.href = "javascript:void(0)"; }
      linkBtn.addEventListener("click", (e) => e.stopPropagation());

      bar.appendChild(labelSpan);
      bar.appendChild(linkBtn);
      grid.appendChild(bar);

      // Hover nas bordas
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

      // Clique simples (link)
      let clickTimer = null;
      let downPos = null;
      bar.addEventListener("mousedown", (e) => { downPos = { x: e.clientX, y: e.clientY }; });
      bar.addEventListener("click", (e) => {
        if (removeMode || e.target.closest(".bar-link")) return;
        const url = (t.link || "").trim();
        if (!url) return;
        const upPos = { x: e.clientX, y: e.clientY };
        const moved = downPos ? (Math.abs(upPos.x - downPos.x) > 3 || Math.abs(upPos.y - downPos.y) > 3) : false;
        if (moved) { downPos = null; return; }
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
        clickTimer = setTimeout(() => { window.open(url, "_blank", "noopener,noreferrer"); clickTimer = null; }, 220);
      });

      // Duplo clique: editar
      bar.addEventListener("dblclick", () => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        if (removeMode) return;
        editingTaskId = t.id;
        editTaskLabelInput.value = t.label;
        editTaskStartInput.value = t.start;
        editTaskEndInput.value   = t.end;
        editTaskColorSel.value   = t.color || "bar1";
        editTaskLinkInput.value  = t.link || "";
        openDialog(editTaskDialog);
      });

      // Tooltip
      bar.addEventListener("mousemove", (ev) => {
        let tip = bar._tip;
        if(!tip){
          tip = document.createElement("div");
          tip.className = "tooltip";
          tip.textContent = `${t.label}: ${fmt(toDate(t.start))} → ${fmt(toDate(t.end))}${t.link ? " • 🔗" : ""}`;
          grid.appendChild(tip);
          bar._tip = tip;
        }
        tip.style.left = `${ev.pageX - grid.getBoundingClientRect().left}px`;
        tip.style.top  = `${bar.getBoundingClientRect().top - grid.getBoundingClientRect().top - 8}px`;
      });
      bar.addEventListener("mouseleave", () => { if(bar._tip){ bar._tip.remove(); bar._tip = null; } });

      // Drag vs Resize
      let dragState = null;

      bar.addEventListener("mousedown", (e) => {
        if (removeMode){
          e.preventDefault();
          if(confirm(`Remover tarefa "${t.label}"?`)){ deleteTaskById(t.id); }
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
          id: t.id
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
        const dy = e.clientY - dragState.startY;

        let newLeft = dragState.origLeft + dx;
        let newTop  = dragState.origTop  + dy;

        newLeft = Math.max(0, Math.min(newLeft, grid.scrollWidth - dragState.origWidth));

        const gridRect = grid.getBoundingClientRect();
        const centerY = (bar.getBoundingClientRect().top - gridRect.top) + (bar.offsetHeight/2) + grid.scrollTop;
        let targetRow = Math.max(0, Math.min(totalRows()-1, Math.floor(centerY / getRowH())));

        bar.style.cursor = "grabbing";

        const snapTop = rowCenterTop(targetRow);
        bar.style.left = `${newLeft}px`;
        bar.style.top  = `${snapTop}px`;
        bar.dataset.targetRow = String(targetRow);

        // auto-scroll
        const gr = gridRect;
        if(e.clientX > gr.right - 30) grid.scrollLeft += 20;
        if(e.clientX < gr.left  + 30) grid.scrollLeft -= 20;
        if(e.clientY > gr.bottom- 30) grid.scrollTop  += 20;
        if(e.clientY < gr.top   + 30) grid.scrollTop  -= 20;
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

        const targetRow = parseInt(bar.dataset.targetRow ?? bar.dataset.rowIndex, 10);
        moveTaskToRow(dragState.id, targetRow);

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
    });
  });

  // Linha do dia atual
  const firstWeek = firstWeekStart(monthsInfo[0].start);
  todayLine.style.display = toggleTodayLine.checked ? "block" : "none";
  const today = new Date();
  const todayX = (nearestMonday(today).getTime() - firstWeek.getTime()) / ((7*MS_DAY)/getCellW());
  todayLine.style.left = `${todayX}px`;

  // Select de categoria (Adicionar tarefa)
  const options = data.categories.map((c, idx) => `<option value="${idx}">${escapeHtml(c.title)}</option>`).join("");
  taskCategorySel.innerHTML = options;

  saveState();
}

// ========= Auxiliares =========
function findTaskById(taskId){
  for(let ci=0; ci<data.categories.length; ci++){
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
  if(e < s){ const tmp = s; s = e; e = tmp; startStr = ymd(s); endStr = ymd(e); }
  x.task.start = startStr; x.task.end = endStr;
  saveState(); render();
}
function addNewTask({categoryIndex, label, start, end, color, link}){
  if (Number.isNaN(categoryIndex) || categoryIndex < 0 || categoryIndex >= data.categories.length){
    alert("Selecione uma categoria válida para adicionar a tarefa.");
    return;
  }
  const id = "t" + Math.random().toString(36).slice(2, 9);
  const cat = data.categories[categoryIndex];
  if(!cat.tasks) cat.tasks = [];
  cat.tasks.push({ id, label, start, end, color, link: link || "" });
  if (!cat.color) cat.color = color || "bar1";
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

// ========= Ligações de eventos =========
startMonthInput.addEventListener("change", () => {
  const [y, m] = startMonthInput.value.split("-").map(Number);
  view.startMonth = new Date(y, m-1, 1);
  render();
});
monthsCountSelect.addEventListener("change", () => {
  view.months = parseInt(monthsCountSelect.value, 10);
  render();
});
applyBtn.addEventListener("click", () => { render(); });

toggleTodayLine.addEventListener("change", () => { render(); });
toggleAltRows.addEventListener("change", () => { render(); });

// Sliders
zoomSlider.addEventListener("input", () => { setCellW(parseInt(zoomSlider.value,10)); render(); });
rowHeightSlider.addEventListener("input", () => {
  const px = parseInt(rowHeightSlider.value, 10);
  setRowH(px);
  rowHeightValue.textContent = `${px} px`;
  render();
  saveState();
});

// Tema
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
    saveState();
  });
}

// ===== Categoria: listeners blindados com DOMContentLoaded =====
function addCategory(){
  const nameInput = document.getElementById("newCategoryName");
  const name = (nameInput?.value || "").trim();
  if (!name) {
    alert("Digite um nome para a categoria.");
    nameInput?.focus();
    return;
  }
  if (!Array.isArray(data.categories)) data.categories = [];
  const exists = data.categories.some(c => (c?.title || "").toLowerCase() === name.toLowerCase());
  if (exists) {
    alert("Já existe uma categoria com esse nome.");
    nameInput?.focus();
    return;
  }
  data.categories.push({ title: name, color: null, tasks: [] });
  nameInput.value = "";
  saveState();
  render();
}

function wireCategoryControls(){
  const nameInput = document.getElementById("newCategoryName");
  const btnAdd    = document.getElementById("addCategoryBtn");
  if (!nameInput || !btnAdd) {
    console.warn("⚠️ newCategoryName ou addCategoryBtn não encontrados no DOM.");
    return;
  }

  // Substitui o botão por um clone para limpar event listeners antigos
  btnAdd.replaceWith(btnAdd.cloneNode(true));
  const btnAddFresh = document.getElementById("addCategoryBtn");

  btnAddFresh.addEventListener("click", addCategory);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addCategory(); }
  });
  btnAddFresh.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addCategory(); }
  });
}

// Garante que os listeners são ligados quando o DOM estiver pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    wireCategoryControls();
  });
} else {
  wireCategoryControls();
}

// ===== Adicionar TAREFA =====
addTaskBtn?.addEventListener("click", () => {
  if (data.categories.length === 0) {
    alert("Primeiro crie uma categoria na barra lateral para adicionar tarefas.");
    newCategoryNameInput?.focus();
    return;
  }
  const today = new Date();
  taskLabelInput.value = "";
  const s = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  taskStartInput.value = ymd(s);
  taskEndInput.value   = ymd(new Date(s.getTime() + 14*MS_DAY));
  taskColorSel.value   = "bar1";
  taskLinkInput.value  = "";
  const options = data.categories.map((c, idx) => `<option value="${idx}">${escapeHtml(c.title)}</option>`).join("");
  taskCategorySel.innerHTML = options;
  openDialog(taskDialog);
});
submitTaskBtn?.addEventListener("click", (ev) => {
  ev.preventDefault();
  const categoryIndex = parseInt(taskCategorySel.value, 10);
  const label = taskLabelInput.value.trim();
  const start = taskStartInput.value;
  const end   = taskEndInput.value;
  const color = taskColorSel.value;
  const link  = (taskLinkInput.value || "").trim();
  if(!label || !start || !end || Number.isNaN(categoryIndex)){ return; }
  addNewTask({categoryIndex, label, start, end, color, link});
  closeDialog(taskDialog);
});

// ===== Editar TAREFA =====
confirmEditTaskBtn?.addEventListener("click", (ev) => {
  ev.preventDefault();
  if(!editingTaskId) return;
  const x = findTaskById(editingTaskId);
  if(!x) return;
  const newLabel = editTaskLabelInput.value.trim();
  const newStart = editTaskStartInput.value;
  const newEnd   = editTaskEndInput.value;
  const newColor = editTaskColorSel.value;
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

// Modo remover (toggle)
removeModeBtn?.addEventListener("click", () => {
  removeMode = !removeMode;
  removeModeBtn.textContent = removeMode ? "Remover (ativo)" : "Remover item";
  removeModeBtn.classList.toggle("primary", removeMode);
});

// Remover categoria (delegação)
categoryList.addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-del-btn");
  if (!btn) return;
  const ci = parseInt(btn.dataset.ci, 10);
  const name = data.categories[ci]?.title || "categoria";
  if (confirm(`Remover a categoria "${name}" e todos os itens dela?`)) {
    removeCategory(ci);
  }
});

// Dropdown de tarefas por categoria
categoryList.addEventListener("change", (e) => {
  const sel = e.target.closest(".cat-task-select");
  if (!sel) return;
  const taskId = sel.value;
  if (!taskId) return;

  const found = findTaskById(taskId);
  if (!found) return;

  const t = found.task;
  const url = (t.link || "").trim();
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const bar = grid.querySelector(`.task-bar[data-id="${taskId}"]`);
    if (bar) {
      const gr = grid.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const dx = (barRect.left - gr.left) - 60;
      grid.scrollLeft += dx;
      bar.style.outline = "2px solid var(--accent)";
      setTimeout(()=> bar.style.outline = "", 800);
    }
  }
  sel.value = "";
});

// ===== Fallback para <dialog> =====
const supportsDialog = typeof HTMLDialogElement === "function" && typeof taskDialog?.showModal === "function";
function openDialog(d){ supportsDialog ? d.showModal() : d.classList.add("open"); }
function closeDialog(d){ supportsDialog ? d.close()     : d.classList.remove("open"); }

// ========= Utilitários =========
function colorToHex(name){
  const map = {
    bar1: getComputedStyle(document.documentElement).getPropertyValue('--bar1').trim(),
    bar2: getComputedStyle(document.documentElement).getPropertyValue('--bar2').trim(),
    bar3: getComputedStyle(document.documentElement).getPropertyValue('--bar3').trim(),
    bar4: getComputedStyle(document.documentElement).getPropertyValue('--bar4').trim(),
    bar5: getComputedStyle(document.documentElement).getPropertyValue('--bar5').trim(),
  };
  return map[name] || map.bar1;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Inicializa tema e desenha
setTheme(currentTheme);
render();
