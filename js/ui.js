// Conexión del panel de control y los indicadores con la aplicación.
// `app` lo proporciona main.js: { toggleRun, reset, addEvent, removeEvent,
// clearEvents, cycleView, set }.

import { fmtTime, fmtDist } from "./utils.js";

const $ = (id) => document.getElementById(id);

export function initUI(app, eventManager) {
  // --- Botones principales ---
  const btnStart = $("btnStart");
  btnStart.addEventListener("click", () => {
    const running = app.toggleRun();
    btnStart.textContent = running ? "⏸ Pausar" : "▶ Iniciar";
    btnStart.classList.toggle("primary", !running);
  });

  $("btnReset").addEventListener("click", () => app.reset());
  $("btnView").addEventListener("click", () => {
    $("btnView").textContent = `🎥 Vista: ${app.cycleView()}`;
  });

  // --- Botones de eventos ---
  const eventButtons = {
    btnBottleneck: "bottleneck",
    btnStopped: "stopped_vehicle",
    btnShoulder: "shoulder_vehicle",
    btnAccident: "accident",
    btnBadoc: "rubbernecking",
    btnBrake: "sudden_braking",
    btnWorks: "roadworks",
  };
  for (const [id, type] of Object.entries(eventButtons)) {
    $(id).addEventListener("click", () => app.addEvent(type));
  }
  $("btnTrucksPlus").addEventListener("click", () => {
    const rng = $("rngTrucks");
    rng.value = Math.min(60, Number(rng.value) + 10);
    rng.dispatchEvent(new Event("input"));
  });
  $("btnClear").addEventListener("click", () => app.clearEvents());

  // --- Sliders ---
  bindSlider("rngFlow", (v) => `${v} veh/h`, (v) => app.set("vehiclesPerHour", v));
  bindSlider("rngTrucks", (v) => `${v} %`, (v) => app.set("truckPercentage", v));
  bindSlider("rngLanes", (v) => `${v}`, (v) => app.set("lanes", v));
  bindSlider("rngLimit", (v) => `${v} km/h`, (v) => app.set("speedLimitKmh", v));
  bindSlider("rngAggr", (v) => `${v} %`, (v) => app.set("aggressiveness", v / 100));
  bindSlider("rngBadoc", (v) => `${v} %`, (v) => app.set("badocIntensity", v / 100));
  bindSlider("rngSpeed", (v) => `×${v}`, (v) => app.set("simSpeed", v));

  // --- Checkboxes ---
  $("chkTrucksOvertake").addEventListener("change", (e) =>
    app.set("trucksCanOvertake", e.target.checked)
  );
  $("chkRain").addEventListener("change", (e) => app.set("rain", e.target.checked));

  // --- Lista de eventos activos ---
  eventManager.onChange(() => renderEventList(app, eventManager));
  renderEventList(app, eventManager);
}

function bindSlider(id, format, onChange) {
  const rng = $(id);
  const out = $(id + "Out");
  const apply = () => {
    const v = Number(rng.value);
    if (out) out.textContent = format(v);
    onChange(v);
  };
  rng.addEventListener("input", apply);
  if (out) out.textContent = format(Number(rng.value));
}

function renderEventList(app, eventManager) {
  const ul = $("eventList");
  ul.innerHTML = "";
  if (!eventManager.events.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Sin eventos activos";
    ul.appendChild(li);
    return;
  }
  for (const ev of eventManager.events) {
    const li = document.createElement("li");
    const pos = ev.position ?? ev.positionStart;
    const span = document.createElement("span");
    span.textContent = `${ev.label ?? ev.type} · km ${(pos / 1000).toFixed(1)}`;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "Eliminar evento";
    btn.addEventListener("click", () => app.removeEvent(ev.id));
    li.append(span, btn);
    ul.appendChild(li);
  }
}

export function updateMetricsUI(m) {
  $("mTime").textContent = fmtTime(m.time);
  $("mVehicles").textContent = String(m.vehicles);
  $("mSpeed").textContent = m.avgSpeedKmh == null ? "–" : `${m.avgSpeedKmh.toFixed(0)} km/h`;
  $("mStopped").textContent = String(m.stopped);
  $("mQueue").textContent = fmtDist(m.queueM);
  $("mMaxQueue").textContent = fmtDist(m.maxQueueM);
  $("mFlow").textContent = `${Math.round(m.flowPerHour)} veh/h`;
  $("mDensity").textContent = `${m.densityPerKm.toFixed(1)} veh/km`;
  $("mLost").textContent = `${m.lostMin.toFixed(1)} min`;
  $("mTravel").textContent =
    m.avgTravelMin == null ? "–" : `${m.avgTravelMin.toFixed(1)} min`;
}
