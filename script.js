
// ========= Persistência =========
const STORAGE_KEY = "ganttData_v13"; // nova chave p/ evitar conflito com estados anteriores

// Limite máximo de altura TOTAL do grid (px)
const MAX_TOTAL_HEIGHT_PX = 1600;

// Fator de escala inicial do grid (2 = dobra a altura base na primeira render)
const DEFAULT_GRID_SCALE = 2;

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
        snapMode: snapModeSelect.value,
        showToday: toggleTodayLine.checked,
        altRows: toggleAltRows ? !!toggleAltRows.checked : true,
        theme: currentTheme // "dark" | "light"
      }
    })
  );
}
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    // dados
    if (obj?.data?.categories) data = obj.data;
    // visão
    if (obj?.view?.startMonth) view.startMonth = new Date(obj.view.startMonth);
    if (obj?.view?.months) view.months = obj.view.months;
    view.extraH = obj?.view?.extraH || 0;
    // UI
    if (obj?.ui?.cellW) setCellW(obj.ui.cellW);
    if (obj?.ui?.rowH) setRowH(obj.ui.rowH);
    if (obj?.ui?.snapMode) snapModeSelect.value = obj.ui.snapMode;
    toggleTodayLine.checked = !!obj?.ui?.showToday;
    if (typeof obj?.ui?.altRows === "boolean" && toggleAltRows) {
      toggleAltRows.checked = obj.ui.altRows;
    }
    if (obj?.ui?.theme) setTheme(obj.ui.theme);
    return obj;
  } catch(e) { console.error("Erro ao ler storage:", e); return null; }
}
// function resetData() {
//   localStorage.removeItem(STORAGE_KEY);
//   data = JSON.parse(JSON.stringify(DEFAULT_DATA));
//   view = { startMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), months: 4, extraH: 0 };
//   setCellW(64);
//   setRowH(68);
//   snapModeSelect.value = "weeks";
//   toggleTodayLine.checked = true;
//   if (toggleAltRows) toggleAltRows.checked = true; // padrão ligado
//   setTheme("dark");
//   syncViewInputs();
//   render();
// }

// ========= Dados de exemplo =========
const DEFAULT_DATA = {
  categories: [
    { title: "Introdução",          tasks: [ { id: "t_demo", label: "Exemplo", start: "2026-02-02", end: "2026-02-23", color: "bar1", link: "" } ], milestones: [] },
    { title: "Bombas Centrífugas",  tasks: [], milestones: [] },
    { title: "Selos Mecânicos",     tasks: [], milestones: [] },
    { title: "Motores",             tasks: [], milestones: [] }
  ]
};

let data = JSON.parse(JSON.stringify(DEFAULT_DATA));
let view = { startMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), months: 4, extraH: 0 };

const loaded = loadState();
let firstRenderBootstrap = !loaded;

// ========= Utilidades de tempo =========
const MS_DAY = 24 * 60 * 60 * 1000;
const toDate = (s) => new Date(`${s}T00:00:00`);
const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function firstWeekStart(date){
  const d = new Date(date);
  const weekday = (d.getDay() + 6) % 7; // 0=Seg … 6=Dom
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

// ========= Elementos / Estado UI =========
let removeMode = false;

const themeToggleBtn   = document.getElementById("themeToggleBtn") || null;
let currentTheme       = (document.body.classList.contains("theme-light") ? "light" : "dark");

const startMonthInput   = document.getElementById("startMonth");
const monthsCountSelect = document.getElementById("monthsCount");
const zoomSlider        = document.getElementById("zoomSlider");
const rowHeightSlider   = document.getElementById("rowHeightSlider");
const rowHeightValue    = document.getElementById("rowHeightValue");
const snapModeSelect    = document.getElementById("snapMode");
const applyBtn          = document.getElementById("applyView");

const addTaskBtn        = document.getElementById("addTaskBtn");
const addMilestoneBtn   = document.getElementById("addMilestoneBtn");
const removeModeBtn     = document.getElementById("removeModeBtn");
const resetDataBtn      = document.getElementById("resetDataBtn");

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
const editTaskColorSel  = document.getElementById("editTaskColor");
const editTaskLinkInput = document.getElementById("editTaskLink");
const confirmEditTaskBtn= document.getElementById("confirmEditTask");
let editingTaskId = null;

const milestoneDialog   = document.getElementById("milestoneDialog");
const msCategorySel     = document.getElementById("msCategory");
const msLabelInput      = document.getElementById("msLabel");
const msDateInput       = document.getElementById("msDate");
const msColorSel        = document.getElementById("msColor");
const submitMilestoneBtn= document.getElementById("submitMilestone");

// ========= UI helpers =========
function syncViewInputs(){
  startMonthInput.value   = `${view.startMonth.getFullYear()}-${String(view.startMonth.getMonth()+1).padStart(2,"0")}`;
  monthsCountSelect.value = String(view.months);
  const currentRowH       = getRowH();
  rowHeightSlider.value   = currentRowH;
  rowHeightValue.textContent = `${currentRowH} px`;
}
syncViewInputs();

function setCellW(px){ document.documentElement.style.setProperty('--cell-w', `${px}px`); }
function getCellW(){ const v = getComputedStyle(document.documentElement).getPropertyValue('--cell-w'); return parseInt(v) || 64; }
function setRowH(px){ document.documentElement.style.setProperty('--row-h', `${px}px`); }
function getRowH(){ const v = getComputedStyle(document.documentElement).getPropertyValue('--row-h'); return parseInt(v) || 68; }

/* Tema (tolerante a ausência do botão) */
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

/* Semanas por mês */
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

// ========= Render principal =========
function render(){
  // Limpa
  timeHeader.innerHTML = "";
  grid.innerHTML = "";
  grid.appendChild(todayLine);
  grid.appendChild(gridResizer);

  // Painel de categorias
  categoryList.innerHTML = data.categories
    .map((c, idx) => `
      <li>
        <span>${c.title}</span>
        <button class="cat-del-btn" data-ci="${idx}" title="Remover categoria">×</button>
      </li>
    `).join("");

  // Meses e semanas
  const monthsInfo = computeMonthsAndWeeks(view.startMonth, view.months);
  const cellW = getCellW();

  // Meses
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

  // Semanas
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

  // Lista contínua de semanas (para minWidth)
  const allWeeks = [];
  monthsInfo.forEach((m, mi) => {
    m.weeks.forEach(w => {
      const wEnd = new Date(w.getTime() + 7*MS_DAY - 1);
      allWeeks.push({ start: new Date(w), end: wEnd, monthIndex: mi });
    });
  });

  // ===== Altura inicial escalada (Opção A) =====
  const rowH = getRowH();
  const baseHeight = data.categories.length * rowH + 24;

  if (firstRenderBootstrap) {
    view.extraH = Math.max(0, (DEFAULT_GRID_SCALE - 1) * baseHeight);
    firstRenderBootstrap = false;
  }

  const desiredTotal = baseHeight + (view.extraH || 0);
  const totalHeight  = Math.min(desiredTotal, MAX_TOTAL_HEIGHT_PX);
  if (desiredTotal > MAX_TOTAL_HEIGHT_PX) {
    view.extraH = Math.max(0, MAX_TOTAL_HEIGHT_PX - baseHeight);
  }
  grid.style.height   = `${totalHeight}px`;
  grid.style.minWidth = `${allWeeks.length * cellW}px`;

  // Listras alternadas (toggle)
  grid.classList.toggle("alt-rows", toggleAltRows ? toggleAltRows.checked : true);

  // Fundo de linhas (a alternância é aplicada via CSS quando .alt-rows está presente)
  data.categories.forEach((_, i) => {
    const bg = document.createElement("div");
    bg.className = "row-bg";
    bg.style.top = `${i*rowH}px`;
    grid.appendChild(bg);
  });

  // Mapas de tempo → pixel
  const timelineStart = allWeeks[0].start.getTime();
  const timelineEnd   = allWeeks[allWeeks.length-1].end.getTime();
  const msPerPixel    = (7*MS_DAY) / cellW;

  function xFromDateStr(dateStr){
    const ms = toDate(dateStr).getTime();
    const delta = ms - timelineStart;
    return Math.max(0, Math.min((timelineEnd - timelineStart) / msPerPixel, delta / msPerPixel));
  }
  function dateStrFromX(x){
    const ms = timelineStart + x * msPerPixel;
    const d = new Date(ms);
    d.setHours(0,0,0,0);
    return (snapModeSelect.value === "weeks") ? ymd(nearestMonday(d)) : ymd(d);
  }

  // ===== Tarefas =====
  data.categories.forEach((cat, rowIndex) => {
    const baseY = rowIndex * rowH + 10;
    let offset = 0;

    cat.tasks.forEach((t) => {
      const x = xFromDateStr(t.start);
      const xEnd = xFromDateStr(t.end);
      const width = Math.max(14, xEnd - x);

      const bar = document.createElement("div");
      bar.className = "task-bar";
      bar.dataset.color    = t.color || "bar1";
      bar.dataset.id       = t.id;
      bar.dataset.rowIndex = String(rowIndex);
      bar.style.left  = `${x}px`;
      bar.style.top   = `${baseY + offset}px`;
      bar.style.width = `${width}px`;
      bar.title = `${t.label} • ${fmt(toDate(t.start))} → ${fmt(toDate(t.end))}`;

      const leftHandle  = document.createElement("div");
      leftHandle.className = "bar-handle left"; leftHandle.dataset.role = "resize-left";
      const labelSpan   = document.createElement("span");
      labelSpan.className = "bar-label"; labelSpan.textContent = t.label;
      const rightHandle = document.createElement("div");
      rightHandle.className = "bar-handle right"; rightHandle.dataset.role = "resize-right";

      // Botão de link ↗
      const linkBtn = document.createElement("a");
      linkBtn.className = "bar-link";
      if (t.link && t.link.trim()) {
        linkBtn.href   = t.link.trim();
        linkBtn.target = "_blank";
        linkBtn.rel    = "noopener noreferrer";
        linkBtn.title  = "Abrir link";
      } else {
        linkBtn.classList.add("disabled");
        linkBtn.title = "Sem link";
        linkBtn.href  = "javascript:void(0)";
      }
      linkBtn.addEventListener("click", (e) => e.stopPropagation());

      bar.appendChild(leftHandle);
      bar.appendChild(labelSpan);
      bar.appendChild(rightHandle);
      bar.appendChild(linkBtn);

      grid.appendChild(bar);

      // Clique simples na barra: abrir link (se existir)
      let clickTimer = null;
      let downPos = null;

      bar.addEventListener("mousedown", (e) => { downPos = { x: e.clientX, y: e.clientY }; });

      bar.addEventListener("click", (e) => {
        if (removeMode) return;
        if (e.target.closest(".bar-handle") || e.target.closest(".bar-link")) return;
        const url = (t.link || "").trim();
        if (!url) return;

        const upPos = { x: e.clientX, y: e.clientY };
        const moved = downPos ? (Math.abs(upPos.x - downPos.x) > 3 || Math.abs(upPos.y - downPos.y) > 3) : false;
        if (moved) { downPos = null; return; }

        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }

        clickTimer = setTimeout(() => {
          window.open(url, "_blank", "noopener,noreferrer");
          clickTimer = null;
        }, 220);
      });

      // Duplo clique: editar
      bar.addEventListener("dblclick", () => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        if (removeMode) return;
        editingTaskId = t.id;
        editTaskLabelInput.value = t.label;
        editTaskColorSel.value   = t.color || "bar1";
        editTaskLinkInput.value  = t.link || "";
        editTaskDialog.showModal();
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

      // Drag da barra
      let drag = null;
      function onBarMouseDown(e){
        const role = e.target.dataset.role || "drag";
        if(removeMode){
          e.preventDefault();
          if(confirm(`Remover tarefa "${t.label}"?`)){ deleteTaskById(t.id); }
          return;
        }
        if (e.detail === 2) return;
        if (role !== "drag") return;

        drag = {
          role: "drag",
          startX: e.clientX, startY: e.clientY,
          origLeft: parseFloat(bar.style.left),
          origTop:  parseFloat(bar.style.top),
          origWidth:parseFloat(bar.style.width),
          id: t.id
        };
        document.addEventListener("mousemove", onDocMouseMove);
        document.addEventListener("mouseup",   onDocMouseUp);
      }
      function onDocMouseMove(e){
        if(!drag) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;

        let newLeft = drag.origLeft + dx;
        let newTop  = drag.origTop  + dy;
        newLeft = Math.max(0, Math.min(newLeft, grid.scrollWidth - drag.origWidth));
        const maxTop = data.categories.length * rowH - (rowH - 10);
        newTop  = Math.max(6, Math.min(newTop, maxTop));
        bar.style.left = `${newLeft}px`;
        bar.style.top  = `${newTop}px`;

        const gr = grid.getBoundingClientRect();
        if(e.clientX > gr.right - 30) grid.scrollLeft += 20;
        if(e.clientX < gr.left  + 30) grid.scrollLeft -= 20;
        if(e.clientY > gr.bottom- 30) grid.scrollTop  += 20;
        if(e.clientY < gr.top   + 30) grid.scrollTop  -= 20;
      }
      function onDocMouseUp(){
        if(!drag) return;
        document.removeEventListener("mousemove", onDocMouseMove);
        document.removeEventListener("mouseup",   onDocMouseUp);

        const newLeft  = parseFloat(bar.style.left);
        const newTop   = parseFloat(bar.style.top);
        const newWidth = parseFloat(bar.style.width);
        const newStart = dateStrFromX(newLeft);
        const newEnd   = dateStrFromX(newLeft + newWidth);

        const centerY     = newTop + (bar.offsetHeight/2);
        const newRowIndex = Math.max(0, Math.min(data.categories.length-1, Math.floor(centerY / rowH)));
        const old = findTaskById(drag.id);

        updateTaskDates(drag.id, newStart, newEnd);
        if(old && old.ci !== newRowIndex) moveTaskToCategory(drag.id, newRowIndex);

        drag = null;
      }
      bar.addEventListener("mousedown", onBarMouseDown);

      // Alças de resize
      function onHandlePointerDown(e){
        e.preventDefault();
        const role = e.target.dataset.role;
        let dragH = {
          role,
          startX: e.clientX,
          origLeft:  parseFloat(bar.style.left),
          origWidth: parseFloat(bar.style.width),
          id: t.id
        };
        function onMove(ev){
          const dx = ev.clientX - dragH.startX;
          if(dragH.role === "resize-left"){
            let newLeft  = dragH.origLeft + dx;
            let newWidth = dragH.origWidth - dx;
            if(newWidth < 14){ newWidth = 14; newLeft = dragH.origLeft + dragH.origWidth - 14; }
            if(newLeft < 0){  newLeft = 0;  newWidth = dragH.origLeft + dragH.origWidth; }
            bar.style.left  = `${newLeft}px`;
            bar.style.width = `${newWidth}px`;
          } else if(dragH.role === "resize-right"){
            let newWidth = dragH.origWidth + dx;
            if(newWidth < 14) newWidth = 14;
            const maxWidth = grid.scrollWidth - dragH.origLeft;
            if(newWidth > maxWidth) newWidth = maxWidth;
            bar.style.width = `${newWidth}px`;
          }
        }
        function onUp(){
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup",   onUp);
          const newLeft  = parseFloat(bar.style.left);
          const newWidth = parseFloat(bar.style.width);
          const newStart = dateStrFromX(newLeft);
          const newEnd   = dateStrFromX(newLeft + newWidth);
          updateTaskDates(dragH.id, newStart, newEnd);
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup",   onUp);
      }
      leftHandle.addEventListener("pointerdown", onHandlePointerDown);
      rightHandle.addEventListener("pointerdown", onHandlePointerDown);

      offset += 28;
    });
  });

  // Linha do dia atual
  const firstWeek = firstWeekStart(monthsInfo[0].start);
  todayLine.style.display = toggleTodayLine.checked ? "block" : "none";
  const today = new Date();
  const todayX = (nearestMonday(today).getTime() - firstWeek.getTime()) / ((7*MS_DAY)/getCellW());
  todayLine.style.left = `${todayX}px`;

  // Preenche selects de categoria
  const options = data.categories.map((c, idx) => `<option value="${idx}">${c.title}</option>`).join("");
  taskCategorySel.innerHTML = options;
  msCategorySel.innerHTML   = options;

  saveState();
}

// ========= Auxiliares de dados =========
function findTaskById(taskId){
  for(let ci=0; ci<data.categories.length; ci++){
    const cat = data.categories[ci];
    for(let ti=0; ti<cat.tasks.length; ti++){
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
function moveTaskToCategory(taskId, newCi){
  const x = findTaskById(taskId);
  if(!x) return;
  const task = x.task;
  data.categories[x.ci].tasks.splice(x.ti, 1);
  data.categories[newCi].tasks.push(task);
  saveState(); render();
}
function moveMilestone(msId, newCi, newDate){
  let found = null;
  for(let ci=0; ci<data.categories.length; ci++){
    const arr = data.categories[ci].milestones || [];
    for(let mi=0; mi<arr.length; mi++){
      if(arr[mi].id === msId){ found = { ci, mi, ms: arr[mi] }; break; }
    }
    if(found) break;
  }
  if(!found) return;
  const m = found.ms;
  if(newDate) m.date = newDate;
  if(found.ci !== newCi){
    data.categories[found.ci].milestones.splice(found.mi, 1);
    if(!data.categories[newCi].milestones) data.categories[newCi].milestones = [];
    data.categories[newCi].milestones.push(m);
  }
  saveState(); render();
}
function addNewTask({categoryIndex, label, start, end, color, link}){
  const id = "t" + Math.random().toString(36).slice(2, 9);
  const cat = data.categories[categoryIndex];
  cat.tasks.push({ id, label, start, end, color, link: link || "" });
  saveState(); render();
}
function addNewMilestone({categoryIndex, label, date, color}){
  const id = "m" + Math.random().toString(36).slice(2, 9);
  const cat = data.categories[categoryIndex];
  if(!cat.milestones) cat.milestones = [];
  cat.milestones.push({ id, label, date, color });
  saveState(); render();
}
function deleteTaskById(taskId){
  const x = findTaskById(taskId);
  if(!x) return;
  data.categories[x.ci].tasks.splice(x.ti, 1);
  saveState(); render();
}
function deleteMilestoneById(msId){
  for(let ci=0; ci<data.categories.length; ci++){
    const arr = data.categories[ci].milestones || [];
    const idx = arr.findIndex(m => m.id === msId);
    if(idx >= 0){
      arr.splice(idx, 1);
      saveState(); render();
      return;
    }
  }
}
function removeCategory(ci){
  if (ci < 0 || ci >= data.categories.length) return;
  data.categories.splice(ci, 1);
  if (data.categories.length === 0) {
    data.categories.push({ title: "Categoria", tasks: [], milestones: [] });
  }
  saveState(); render();
}

// ========= Interações =========
startMonthInput.addEventListener("change", () => {
  const [y, m] = startMonthInput.value.split("-").map(Number);
  view.startMonth = new Date(y, m-1, 1);
  render();
});
monthsCountSelect.addEventListener("change", () => {
  view.months = parseInt(monthsCountSelect.value, 10);
  render();
});
// applyBtn.addEventListener("click", () => { render(); });

snapModeSelect.addEventListener("change", () => { render(); });
toggleTodayLine.addEventListener("change", () => { render(); });
if (toggleAltRows) toggleAltRows.addEventListener("change", () => { render(); });

// Sliders
zoomSlider.addEventListener("input", () => { setCellW(parseInt(zoomSlider.value,10)); render(); });
rowHeightSlider.addEventListener("input", () => {
  const px = parseInt(rowHeightSlider.value, 10);
  setRowH(px);
  rowHeightValue.textContent = `${px} px`;
  render();
  saveState();
});

// Tema (se existir o botão)
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
    saveState();
  });
}

// Adicionar TAREFA (com link)
addTaskBtn.addEventListener("click", () => {
  const today = new Date();
  taskLabelInput.value = "";
  const s = nearestMonday(today);
  taskStartInput.value = ymd(s);
  taskEndInput.value   = ymd(new Date(s.getTime() + 14*MS_DAY));
  taskColorSel.value   = "bar1";
  taskLinkInput.value  = "";
  taskDialog.showModal();
});
submitTaskBtn.addEventListener("click", (ev) => {
  ev.preventDefault();
  const categoryIndex = parseInt(taskCategorySel.value, 10);
  const label = taskLabelInput.value.trim();
  const start = taskStartInput.value;
  const end   = taskEndInput.value;
  const color = taskColorSel.value;
  const link  = (taskLinkInput.value || "").trim();
  if(!label || !start || !end){ return; }
  addNewTask({categoryIndex, label, start, end, color, link});
  taskDialog.close();
});

// Editar TAREFA (duplo clique)
confirmEditTaskBtn.addEventListener("click", (ev) => {
  ev.preventDefault();
  if(!editingTaskId) return;
  const x = findTaskById(editingTaskId);
  if(!x) return;
  x.task.label = editTaskLabelInput.value.trim() || x.task.label;
  x.task.color = editTaskColorSel.value || x.task.color;
  x.task.link  = (editTaskLinkInput.value || "").trim();
  editingTaskId = null;
  saveState(); render();
  editTaskDialog.close();
});

// Adicionar MARCO
addMilestoneBtn.addEventListener("click", () => {
  const today = new Date();
  msLabelInput.value = "";
  msDateInput.value  = ymd(nearestMonday(today));
  msColorSel.value   = "bar4";
  milestoneDialog.showModal();
});
submitMilestoneBtn.addEventListener("click", (ev) => {
  ev.preventDefault();
  const categoryIndex = parseInt(msCategorySel.value, 10);
  const label = msLabelInput.value.trim();
  const date  = msDateInput.value;
  const color = msColorSel.value;
  if(!label || !date) return;
  addNewMilestone({ categoryIndex, label, date, color });
  milestoneDialog.close();
});

// Modo remover (toggle)
removeModeBtn.addEventListener("click", () => {
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

// ====== Adicionar categoria (corrigido/garantido) ======
if (addCategoryBtn) {
  addCategoryBtn.addEventListener("click", () => {
    const name = (newCategoryNameInput?.value || "").trim();
    if (!name) return;
    data.categories.push({ title: name, tasks: [], milestones: [] });
    newCategoryNameInput.value = "";
    saveState();
    render();
  });
}

// ====== Resize do grid arrastando em área vazia ======
function isEmptyGridArea(target){
  if (target.closest(".task-bar") || target.closest(".milestone")) return false;
  return target.closest(".gantt-grid") !== null;
}
grid.addEventListener("mousemove", (e) => {
  const onEmpty = isEmptyGridArea(e.target);
  grid.classList.toggle("resize-ready", onEmpty);
});
grid.addEventListener("mouseleave", () => { grid.classList.remove("resize-ready"); });
grid.addEventListener("mousedown", (e) => {
  if (!isEmptyGridArea(e.target)) return;
  if (e.button !== 0) return;

  const startY = e.clientY;
  const startExtra = view.extraH || 0;
  const rowH = getRowH();
  const baseHeight = (data.categories.length * rowH) + 24;

  grid.classList.add("resize-ready");

  function onMove(ev){
    const deltaY = ev.clientY - startY;
    let desired = baseHeight + Math.max(0, startExtra + deltaY);
    desired = Math.min(desired, MAX_TOTAL_HEIGHT_PX);
    view.extraH = Math.max(0, desired - baseHeight);
    grid.style.height = `${desired}px`;
  }
  function onUp(){
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    grid.classList.remove("resize-ready");
    saveState();
    render();
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// ====== Redimensionar o grid pela alça inferior ======
gridResizer.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const startY = e.clientY;
  const startExtra = view.extraH || 0;
  const rowH = getRowH();
  const baseHeight = (data.categories.length * rowH) + 24;

  function onMove(ev){
    const delta = ev.clientY - startY;
    let desired = baseHeight + Math.max(0, startExtra + delta);
    desired = Math.min(desired, MAX_TOTAL_HEIGHT_PX);
    view.extraH = Math.max(0, desired - baseHeight);
    grid.style.height = `${desired}px`;
  }
  function onUp(){
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    saveState();
    render();
  }
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
});

// Aplica tema atual (mesmo se não houver botão)
setTheme(currentTheme);

// Primeira render
render();
