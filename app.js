// =================== STORAGE KEYS ===================
const KEY_EX = "treino_pr_exercicios_v2";
const KEY_SESS = "treino_pr_sessao_v2";
const KEY_HIST = "treino_pr_historico_v2";

// =================== HELPERS ===================
const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

function loadKey(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveKey(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function roundTo(value, step) {
  const s = Number(step);
  return Math.round(value / s) * s;
}
function fmtKg(x) {
  const n = Number(x);
  return (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)).replace(".", ",") + " kg";
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function methodLabel(method) {
  return {
    straight: "Série reta",
    dropset: "Dropset",
    pyramid_up: "Pirâmide subida (upset)",
    pyramid_down: "Pirâmide descida",
    amrap: "AMRAP"
  }[method] ?? method;
}

// =================== PLAN BUILDER ===================
function buildPlan(item) {
  const oneRm = Number(item.oneRm);
  const step = Number(item.roundTo);

  const mk = (label, pct, reps, restSec = item.restSec) => {
    const w = roundTo(oneRm * pct, step);
    return { label, pct, reps, weight: w, restSec };
  };

  switch (item.method) {
    case "straight":
      return [
        mk("S1", 0.70, "8 reps"),
        mk("S2", 0.70, "8 reps"),
        mk("S3", 0.70, "8 reps"),
        mk("S4", 0.70, "8 reps"),
      ];
    case "dropset":
      return [
        mk("Topo", 0.85, "6 reps", Math.max(30, Math.floor(item.restSec * 0.6))),
        mk("Drop 1", 0.75, "8 reps", Math.max(20, Math.floor(item.restSec * 0.45))),
        mk("Drop 2", 0.65, "10 reps", Math.max(15, Math.floor(item.restSec * 0.35))),
      ];
    case "pyramid_up":
      return [
        mk("1", 0.60, "12 reps"),
        mk("2", 0.70, "10 reps"),
        mk("3", 0.80, "8 reps"),
        mk("4", 0.85, "6 reps"),
      ];
    case "pyramid_down":
      return [
        mk("1", 0.85, "6 reps"),
        mk("2", 0.80, "8 reps"),
        mk("3", 0.70, "10 reps"),
        mk("4", 0.60, "12 reps"),
      ];
    case "amrap":
      return [
        mk("AMRAP", 0.75, "máx reps (RIR 1-2)"),
        mk("Back-off", 0.65, "10 reps controladas"),
      ];
    default:
      return [mk("S1", 0.70, "8 reps")];
  }
}

// =================== STATE ===================
let exercises = loadKey(KEY_EX, []);
let sessionByDate = loadKey(KEY_SESS, {}); // { "YYYY-MM-DD": { items: [...] } }
let historyByDate = loadKey(KEY_HIST, {}); // { "YYYY-MM-DD": { finishedAt, items: [...] } }

// =================== TABS ===================
const tabButtons = document.querySelectorAll(".tab");
const panes = {
  exercicios: $("#tab-exercicios"),
  treino: $("#tab-treino"),
  historico: $("#tab-historico"),
  corrida: $("#tab-corrida"),
};


function setTab(name) {
  tabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  Object.entries(panes).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  // refreshes
  if (name === "treino") renderSession();
  if (name === "corrida") renderRunPlan();
  if (name === "historico") renderHistory();
}
tabButtons.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

// =================== EXERCICIOS UI ===================
const form = $("#formExercise");
const listEl = $("#list");
const emptyState = $("#emptyState");
const searchEl = $("#search");
const sortEl = $("#sort");

let editingId = null;

function renderExercises() {
  const q = (searchEl.value || "").trim().toLowerCase();
  let filtered = exercises.filter(i => i.name.toLowerCase().includes(q));

  const sort = sortEl.value;
  filtered = filtered.slice().sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "rm_desc") return Number(b.oneRm) - Number(a.oneRm);
    if (sort === "rm_asc") return Number(a.oneRm) - Number(b.oneRm);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  listEl.innerHTML = "";
  emptyState.style.display = filtered.length ? "none" : "block";

  for (const item of filtered) {
    const plan = buildPlan(item);

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-top">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <div class="meta">
            <span class="chip">1RM: <strong>${fmtKg(item.oneRm)}</strong></span>
            <span class="chip">Método: <strong>${escapeHtml(methodLabel(item.method))}</strong></span>
            <span class="chip">Descanso: <strong>${item.restSec}s</strong></span>
            <span class="chip">Arred: <strong>${String(item.roundTo).replace(".", ",")}kg</strong></span>
          </div>
          ${item.notes ? `<div class="muted">📝 ${escapeHtml(item.notes)}</div>` : ""}
        </div>
        <span class="badge">${new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
      </div>

      <div class="plan">
        ${plan.map((s) => `
          <div class="stage">
            <div>
              <strong>${escapeHtml(s.label)} — ${fmtKg(s.weight)}</strong>
              <div><span>${escapeHtml(s.reps)} • ${Math.round(s.pct*100)}% do 1RM</span></div>
            </div>
            <button class="pill" data-rest="${s.restSec}">Descansar ${s.restSec}s</button>
          </div>
        `).join("")}
      </div>

      <div class="actions">
        <button class="pill" data-edit="${item.id}">Editar</button>
        <button class="pill" data-dup="${item.id}">Duplicar</button>
        <button class="pill" data-del="${item.id}">Excluir</button>
      </div>
    `;
    listEl.appendChild(div);
  }

  hydratePicker();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const payload = {
    id: editingId ?? uid(),
    name: $("#name").value.trim(),
    method: $("#method").value,
    oneRm: Number($("#oneRm").value),
    roundTo: Number($("#roundTo").value),
    restSec: Number($("#restSec").value),
    notes: $("#notes").value.trim(),
    createdAt: editingId ? (exercises.find(i => i.id === editingId)?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!payload.name || !payload.oneRm || payload.oneRm <= 0) return;

  if (editingId) {
    exercises = exercises.map(i => i.id === editingId ? payload : i);
    editingId = null;
  } else {
    exercises.unshift(payload);
  }

  saveKey(KEY_EX, exercises);
  form.reset();
  $("#restSec").value = 90;
  $("#roundTo").value = 2.5;
  renderExercises();
});

listEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.dataset.rest) {
    setTimer(Number(btn.dataset.rest));
    startTimer();
    return;
  }

  if (btn.dataset.del) {
    exercises = exercises.filter(i => i.id !== btn.dataset.del);
    saveKey(KEY_EX, exercises);
    renderExercises();
    return;
  }

  if (btn.dataset.dup) {
    const base = exercises.find(i => i.id === btn.dataset.dup);
    if (!base) return;
    const copy = { ...base, id: uid(), name: base.name + " (copy)", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    exercises.unshift(copy);
    saveKey(KEY_EX, exercises);
    renderExercises();
    return;
  }

  if (btn.dataset.edit) {
    const it = exercises.find(i => i.id === btn.dataset.edit);
    if (!it) return;
    editingId = it.id;
    $("#name").value = it.name;
    $("#method").value = it.method;
    $("#oneRm").value = it.oneRm;
    $("#roundTo").value = it.roundTo;
    $("#restSec").value = it.restSec;
    $("#notes").value = it.notes || "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

searchEl.addEventListener("input", renderExercises);
sortEl.addEventListener("change", renderExercises);

$("#btnDemo").addEventListener("click", () => {
  const demo = [
    { name:"Supino reto", method:"pyramid_up", oneRm:100, roundTo:2.5, restSec:120, notes:"Controle na descida" },
    { name:"Agachamento livre", method:"straight", oneRm:140, roundTo:2.5, restSec:180, notes:"Brace forte" },
    { name:"Remada curvada", method:"dropset", oneRm:90, roundTo:2.5, restSec:90, notes:"Sem roubar" }
  ].map(d => ({ ...d, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

  exercises = [...demo, ...exercises];
  saveKey(KEY_EX, exercises);
  renderExercises();
});

// =================== TREINO DO DIA ===================
const sessionDateEl = $("#sessionDate");
const pickExerciseEl = $("#pickExercise");
const sessionListEl = $("#sessionList");
const sessionEmptyEl = $("#sessionEmpty");

function hydratePicker() {
  pickExerciseEl.innerHTML = "";
  if (!exercises.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Cadastre exercícios primeiro";
    pickExerciseEl.appendChild(opt);
    pickExerciseEl.disabled = true;
    return;
  }
  pickExerciseEl.disabled = false;
  for (const ex of exercises.slice().sort((a,b)=>a.name.localeCompare(b.name))) {
    const opt = document.createElement("option");
    opt.value = ex.id;
    opt.textContent = ex.name;
    pickExerciseEl.appendChild(opt);
  }
}

function getSession(date) {
  return sessionByDate[date]?.items ?? [];
}
function setSession(date, items) {
  sessionByDate[date] = { items };
  saveKey(KEY_SESS, sessionByDate);
}

// ===== Import/Export do Treino do Dia (sessão) =====
$("#btnExportSession")?.addEventListener("click", () => {
  const date = ensureSessionDate();
  const items = getSession(date);

  const payload = {
    version: "session-v1",
    exportedAt: new Date().toISOString(),
    date,
    items
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `treino-do-dia-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("#fileImportSession")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  try {
    const data = JSON.parse(text);

    if (data?.version !== "session-v1" || !Array.isArray(data?.items)) {
      throw new Error("Formato inválido");
    }

    const date = ensureSessionDate();

    // estratégia simples e segura:
    // importar SUBSTITUI o treino do dia selecionado
    setSession(date, data.items);
    renderSession();

    alert("Treino importado com sucesso ✅");
  } catch {
    alert("Arquivo inválido. Use um JSON exportado pelo botão 'Exportar treino'.");
  } finally {
    e.target.value = "";
  }
});


function ensureSessionDate() {
  if (!sessionDateEl.value) sessionDateEl.value = todayIso();
  return sessionDateEl.value;
}

function addToSession(date, exerciseId) {
  const ex = exercises.find(e => e.id === exerciseId);
  if (!ex) return;

  const plan = buildPlan(ex);
  const sessionItem = {
    id: uid(),
    exerciseId: ex.id,
    name: ex.name,
    method: ex.method,
    oneRm: ex.oneRm,
    roundTo: ex.roundTo,
    restSec: ex.restSec,
    stages: plan.map((s) => ({ ...s, done: false })), // check por série
  };

  const items = getSession(date);
  items.push(sessionItem);
  setSession(date, items);
}

function renderSession() {
  const date = ensureSessionDate();
  const items = getSession(date);

  sessionListEl.innerHTML = "";
  sessionEmptyEl.style.display = items.length ? "none" : "block";

  items.forEach((it, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-top">
        <div>
          <h3>${escapeHtml(it.name)}</h3>
          <div class="meta">
            <span class="chip">Método: <strong>${escapeHtml(methodLabel(it.method))}</strong></span>
            <span class="chip">1RM: <strong>${fmtKg(it.oneRm)}</strong></span>
          </div>
        </div>
        <span class="badge">#${idx + 1}</span>
      </div>

      <div class="plan">
        ${it.stages.map((s, sidx) => `
          <div class="stage">
            <div>
              <strong>${escapeHtml(s.label)} — ${fmtKg(s.weight)}</strong>
              <div><span>${escapeHtml(s.reps)} • ${Math.round(s.pct*100)}% • Desc ${s.restSec}s</span></div>
            </div>
            <div class="row tight">
              <button class="pill" data-rest="${s.restSec}">Descansar</button>
              <button class="pill ${s.done ? "done" : ""}" data-toggle="${it.id}:${sidx}">
                ${s.done ? "Feita ✅" : "Marcar"}
              </button>
            </div>
          </div>
        `).join("")}
      </div>

      <div class="actions">
        <button class="pill" data-moveup="${it.id}">Subir</button>
        <button class="pill" data-movedown="${it.id}">Descer</button>
        <button class="pill" data-remove="${it.id}">Remover</button>
      </div>
    `;
    sessionListEl.appendChild(div);
  });
}

$("#btnAddToSession").addEventListener("click", () => {
  const date = ensureSessionDate();
  const exId = pickExerciseEl.value;
  if (!exId) return;
  addToSession(date, exId);
  renderSession();
});

$("#btnLoadSession").addEventListener("click", () => renderSession());

sessionListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const date = ensureSessionDate();
  const items = getSession(date);

  if (btn.dataset.rest) {
    setTimer(Number(btn.dataset.rest));
    startTimer();
    return;
  }

  if (btn.dataset.toggle) {
    const [itemId, stageIdxStr] = btn.dataset.toggle.split(":");
    const stageIdx = Number(stageIdxStr);
    const it = items.find(x => x.id === itemId);
    if (!it) return;
    it.stages[stageIdx].done = !it.stages[stageIdx].done;
    setSession(date, items);
    renderSession();

    // engata descanso se marcou como feita
    if (it.stages[stageIdx].done) {
      setTimer(Number(it.stages[stageIdx].restSec));
      startTimer();
    }
    return;
  }

  if (btn.dataset.remove) {
    const next = items.filter(x => x.id !== btn.dataset.remove);
    setSession(date, next);
    renderSession();
    return;
  }

  if (btn.dataset.moveup || btn.dataset.movedown) {
    const id = btn.dataset.moveup || btn.dataset.movedown;
    const i = items.findIndex(x => x.id === id);
    if (i < 0) return;
    const j = btn.dataset.moveup ? i - 1 : i + 1;
    if (j < 0 || j >= items.length) return;
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
    setSession(date, items);
    renderSession();
    return;
  }
});

$("#btnClearSession").addEventListener("click", () => {
  const date = ensureSessionDate();
  if (!confirm(`Limpar o treino do dia ${date}?`)) return;
  setSession(date, []);
  renderSession();
});

$("#btnFinishSession").addEventListener("click", () => {
  const date = ensureSessionDate();
  const items = getSession(date);
  if (!items.length) return alert("Sem treino pra finalizar.");

  // salva snapshot no histórico
  historyByDate[date] = {
    finishedAt: new Date().toISOString(),
    items: structuredClone(items),
  };
  saveKey(KEY_HIST, historyByDate);

  alert("Treino finalizado e salvo no histórico. Consistência ganha de talento.");
  setTab("historico");
});

// =================== CORRIDA 5K (6 SEMANAS) ===================
const KEY_RUN = "treino_pr_corrida_v1";

let runState = loadKey(KEY_RUN, null);
// runState = { startDate, goalDate, sessions:[{id,date,label,workout,done,distanceKm,timeMin,pace}] }

const runStartDateEl = $("#runStartDate");
const runGoalDateEl = $("#runGoalDate");
const runPlanListEl = $("#runPlanList");
const runEmptyEl = $("#runEmpty");
const runSummaryEl = $("#runSummary");

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Gera treinos Ter/Qui/Sáb por 6 semanas = 18 sessões
function generateRunPlan(startDateIso) {
  // achar o “primeiro Ter/Qui/Sáb” a partir da data escolhida
  // 0 dom, 1 seg, 2 ter, 3 qua, 4 qui, 5 sex, 6 sáb
  const start = new Date(startDateIso + "T00:00:00");
  const weekdaysWanted = [2, 4, 6]; // Ter, Qui, Sáb

  const sessions = [];
  let cursor = new Date(start);

  // templates por semana (A,B,C)
  const weeks = [
    [
      "A", "8x (1 min correndo leve + 1 min andando)",
      "B", "10x (1 min corre + 1 min anda)",
      "C", "6x (2 min corre + 1 min anda)"
    ],
    [
      "A", "8x (2 min corre + 1 min anda)",
      "B", "6x (3 min corre + 1 min anda)",
      "C", "20 min total: 2 min corre / 1 min anda"
    ],
    [
      "A", "5x (4 min corre + 1 min anda)",
      "B", "3x (6 min corre + 2 min anda)",
      "C", "25 min total: tenta 10 min contínuos + 3/1"
    ],
    [
      "A", "3x (8 min corre + 2 min anda)",
      "B", "2x (12 min corre + 3 min anda)",
      "C", "35 min total: correr o máximo, caminhar se precisar"
    ],
    [
      "A", "20 min contínuo (bem leve)",
      "B", "3x (6 min corre + 1 min anda) dentro de 30 min",
      "C", "40 min total: corrida contínua com 1–2 caminhadas curtas"
    ],
    [
      "A", "25 min contínuo",
      "B", "Pace: 10 leve + 6x(1 rápido + 2 leve) + 5 leve",
      "C", "5K: corrida contínua em controle total"
    ],
  ];

  // montar datas de treino
  let weekIndex = 0;
  let which = 0; // 0=A,1=B,2=C

  while (weekIndex < 6) {
    const day = cursor.getDay();
    if (weekdaysWanted.includes(day)) {
      const [lab1, w1, lab2, w2, lab3, w3] = weeks[weekIndex];
      const workout = which === 0 ? w1 : which === 1 ? w2 : w3;
      const label = which === 0 ? lab1 : which === 1 ? lab2 : lab3;

      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, "0");
      const dd = String(cursor.getDate()).padStart(2, "0");
      const dateIso = `${yyyy}-${mm}-${dd}`;

      sessions.push({
        id: uid(),
        date: dateIso,
        label: `Semana ${weekIndex + 1} • ${label}`,
        workout,
        done: false,
        distanceKm: "",
        timeMin: "",
        pace: ""
      });

      which++;
      if (which >= 3) {
        which = 0;
        weekIndex++;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const goalDate = sessions[sessions.length - 1]?.date ?? addDays(startDateIso, 42);

  return {
    startDate: startDateIso,
    goalDate,
    sessions
  };
}

function calcPace(distanceKm, timeMin) {
  const d = Number(distanceKm);
  const t = Number(timeMin);
  if (!d || !t || d <= 0 || t <= 0) return "";
  const pace = t / d; // min por km
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}/km`;
}

function renderRunPlan() {
  // set defaults
  if (!runStartDateEl.value) runStartDateEl.value = todayIso();

  runPlanListEl.innerHTML = "";

  if (!runState) {
    runEmptyEl.style.display = "block";
    runGoalDateEl.value = "";
    runSummaryEl.textContent = "Nenhum plano gerado ainda.";
    return;
  }

  runEmptyEl.style.display = "none";
  runGoalDateEl.value = runState.goalDate;

  const total = runState.sessions.length;
  const done = runState.sessions.filter(s => s.done).length;
  runSummaryEl.innerHTML = `<strong>${done}</strong>/<strong>${total}</strong> treinos feitos • meta 5K: <strong>${runState.goalDate}</strong>`;

  for (const s of runState.sessions) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-top">
        <div>
          <h3>${escapeHtml(s.label)} — ${escapeHtml(s.date)}</h3>
          <div class="muted">${escapeHtml(s.workout)}</div>
          <div class="kpi">
            <span class="chip">Dist: <strong>${s.distanceKm || "-"}</strong> km</span>
            <span class="chip">Tempo: <strong>${s.timeMin || "-"}</strong> min</span>
            <span class="chip">Pace: <strong>${s.pace || "-"}</strong></span>
          </div>
        </div>
        <span class="badge">${s.done ? "✅ FEITO" : "PENDENTE"}</span>
      </div>

      <div class="row">
        <div class="field">
          <label>Distância (km)</label>
          <input class="runDist" data-id="${s.id}" type="number" step="0.1" min="0" placeholder="ex: 3.2" value="${s.distanceKm}">
        </div>
        <div class="field">
          <label>Tempo total (min)</label>
          <input class="runTime" data-id="${s.id}" type="number" step="1" min="0" placeholder="ex: 28" value="${s.timeMin}">
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <button class="pill ${s.done ? "done" : ""}" data-toggle-run="${s.id}">
            ${s.done ? "Marcar como NÃO feito" : "Marcar como FEITO"}
          </button>
        </div>
      </div>

      <div class="small">Dica: marcou feito? se quiser, usa o timer como descanso/cooldown também.</div>
    `;
    runPlanListEl.appendChild(div);
  }
}

$("#btnGenerateRunPlan").addEventListener("click", () => {
  const start = runStartDateEl.value || todayIso();
  runState = generateRunPlan(start);
  saveKey(KEY_RUN, runState);
  renderRunPlan();
});

$("#btnResetRunPlan").addEventListener("click", () => {
  if (!confirm("Resetar o plano de corrida?")) return;
  runState = null;
  saveKey(KEY_RUN, runState);
  renderRunPlan();
});

$("#btnExportRunOnly").addEventListener("click", () => {
  const payload = {
    version: "run-v1",
    exportedAt: new Date().toISOString(),
    runState
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `corrida-5k-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

runPlanListEl.addEventListener("input", (e) => {
  if (!runState) return;
  const t = e.target;

  if (t.classList.contains("runDist") || t.classList.contains("runTime")) {
    const id = t.dataset.id;
    const s = runState.sessions.find(x => x.id === id);
    if (!s) return;

    const distEl = runPlanListEl.querySelector(`.runDist[data-id="${id}"]`);
    const timeEl = runPlanListEl.querySelector(`.runTime[data-id="${id}"]`);

    s.distanceKm = distEl.value;
    s.timeMin = timeEl.value;
    s.pace = calcPace(s.distanceKm, s.timeMin);

    saveKey(KEY_RUN, runState);
    renderRunPlan(); // simples e direto (MVP). Depois a gente otimiza.
  }
});

runPlanListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || !runState) return;

  if (btn.dataset.toggleRun) {
    const id = btn.dataset.toggleRun;
    const s = runState.sessions.find(x => x.id === id);
    if (!s) return;

    s.done = !s.done;

    // Se marcou feito e tem tempo/dist, atualiza pace
    s.pace = calcPace(s.distanceKm, s.timeMin);

    saveKey(KEY_RUN, runState);
    renderRunPlan();

    // Engate “micro motivação”: se marcou feito, inicia 60s de cooldown
    if (s.done) {
      setTimer(60);
      startTimer();
    }
  }
});

// =================== HISTÓRICO ===================
const historyListEl = $("#historyList");
const historyEmptyEl = $("#historyEmpty");

function renderHistory() {
  const entries = Object.entries(historyByDate)
    .sort((a,b) => new Date(b[0]) - new Date(a[0])); // mais recente primeiro

  historyListEl.innerHTML = "";
  historyEmptyEl.style.display = entries.length ? "none" : "block";

  for (const [date, data] of entries) {
    const div = document.createElement("div");
    div.className = "item";

    const totalSets = data.items.reduce((acc, it) => acc + it.stages.length, 0);
    const doneSets = data.items.reduce((acc, it) => acc + it.stages.filter(s=>s.done).length, 0);

    div.innerHTML = `
      <div class="item-top">
        <div>
          <h3>${date} — ${doneSets}/${totalSets} séries marcadas</h3>
          <div class="muted">Finalizado em: ${new Date(data.finishedAt).toLocaleString("pt-BR")}</div>
        </div>
        <span class="badge">LOG</span>
      </div>

      <div class="plan">
        ${data.items.map(it => `
          <div class="stage">
            <div>
              <strong>${escapeHtml(it.name)}</strong>
              <div><span>${escapeHtml(methodLabel(it.method))}</span></div>
            </div>
            <span>${it.stages.filter(s=>s.done).length}/${it.stages.length} ✅</span>
          </div>
        `).join("")}
      </div>

      <div class="actions">
        <button class="pill" data-reopen="${date}">Reabrir como Treino do Dia</button>
        <button class="pill" data-delhist="${date}">Excluir histórico</button>
      </div>
    `;
    historyListEl.appendChild(div);
  }
}

historyListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.dataset.delhist) {
    const date = btn.dataset.delhist;
    delete historyByDate[date];
    saveKey(KEY_HIST, historyByDate);
    renderHistory();
    return;
  }

  if (btn.dataset.reopen) {
    const date = btn.dataset.reopen;
    const data = historyByDate[date];
    if (!data) return;
    // carrega snapshot como sessão do dia selecionado
    sessionByDate[date] = { items: structuredClone(data.items) };
    saveKey(KEY_SESS, sessionByDate);
    sessionDateEl.value = date;
    setTab("treino");
    renderSession();
    return;
  }
});

// =================== EXPORT / IMPORT / RESET ===================
$("#btnExport").addEventListener("click", () => {
  const payload = {
    version: "v2",
    exportedAt: new Date().toISOString(),
    exercises,
    sessionByDate,
    historyByDate
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `treino-pr-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("#fileImport").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  try {
    const data = JSON.parse(text);

    // aceita export v2 ou lista antiga
    if (data?.version === "v2") {
      exercises = Array.isArray(data.exercises) ? data.exercises : exercises;
      sessionByDate = data.sessionByDate ?? sessionByDate;
      historyByDate = data.historyByDate ?? historyByDate;
    } else if (Array.isArray(data)) {
      // fallback: importar só exercícios (v1)
      exercises = [...data, ...exercises];
    } else {
      throw new Error("Formato inválido");
    }

    saveKey(KEY_EX, exercises);
    saveKey(KEY_SESS, sessionByDate);
    saveKey(KEY_HIST, historyByDate);

    renderExercises();
    renderSession();
    renderRunPlan();
    renderHistory();
  } catch {
    alert("Arquivo inválido. Use um JSON exportado pelo app.");
  } finally {
    e.target.value = "";
  }
});

$("#btnReset").addEventListener("click", () => {
  if (!confirm("Resetar tudo? Isso apaga exercícios, sessão e histórico.")) return;
  exercises = [];
  sessionByDate = {};
  historyByDate = {};
  saveKey(KEY_EX, exercises);
  saveKey(KEY_SESS, sessionByDate);
  saveKey(KEY_HIST, historyByDate);
  renderExercises();
  renderSession();
  renderHistory();
});

// =================== TIMER ===================
let timerTotal = 90;
let timerLeft = 90;
let timerInterval = null;

const timeLabel = $("#timeLabel");
const timerInput = $("#timerInput");

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
function paintTimer() {
  timeLabel.textContent = fmtTime(timerLeft);
  timerInput.value = timerTotal;
}
function setTimer(sec) {
  timerTotal = Math.max(5, Math.floor(sec));
  timerLeft = timerTotal;
  paintTimer();
}
function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    timerLeft -= 1;
    paintTimer();
    if (timerLeft <= 0) {
      stopTimer();
      timerLeft = 0;
      paintTimer();
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 180);
      } catch {}
    }
  }, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

$("#btnStart").addEventListener("click", () => startTimer());
$("#btnPause").addEventListener("click", () => stopTimer());
$("#btnResetTimer").addEventListener("click", () => {
  stopTimer();
  timerLeft = timerTotal;
  paintTimer();
});
timerInput.addEventListener("change", () => setTimer(Number(timerInput.value)));
document.querySelectorAll("[data-preset]").forEach(btn => {
  btn.addEventListener("click", () => setTimer(Number(btn.dataset.preset)));
});

// ===== Timer Dock sync (mobile) =====
const dockTime = document.querySelector("#dockTime");
const dockStart = document.querySelector("#dockStart");
const dockPause = document.querySelector("#dockPause");
const dockReset = document.querySelector("#dockReset");

function syncDock() {
  if (!dockTime) return;
  dockTime.textContent = document.querySelector("#timeLabel")?.textContent ?? "00:00";
}

// chama sempre que pintar o timer
const _paintTimer = paintTimer;
paintTimer = function () {
  _paintTimer();
  syncDock();
};

dockStart?.addEventListener("click", () => startTimer());
dockPause?.addEventListener("click", () => stopTimer());
dockReset?.addEventListener("click", () => {
  stopTimer();
  timerLeft = timerTotal;
  paintTimer();
});

syncDock();

// =================== INIT ===================
$("#sessionDate").value = todayIso();
setTimer(90);
renderExercises();
renderSession();
renderHistory();
hydratePicker();

setTab("treino");

// ===== PWA: Service Worker =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}
