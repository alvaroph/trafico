// Gestor de eventos/incidencias: cortes de carril, vehículos parados,
// accidentes, efecto badoc (mirón), obras... Solo datos, sin Three.js.

import { clamp, lerp } from "./utils.js";

let nextEventId = 1;

const CLOSURE_TYPES = new Set(["lane_closure", "accident", "roadworks"]);

export class EventManager {
  constructor(road) {
    this.road = road;
    this.events = [];
    this.listeners = [];
    this.badocIntensity = 1; // multiplicador global del efecto mirón
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.events);
  }

  add(ev) {
    ev.id = `event_${String(nextEventId++).padStart(3, "0")}`;
    this.events.push(ev);
    this.emit();
    return ev;
  }

  remove(id) {
    const n = this.events.filter((e) => e.id !== id);
    if (n.length !== this.events.length) {
      this.events = n;
      this.emit();
    }
  }

  clearAll() {
    this.events = [];
    this.emit();
  }

  // Elimina eventos cuya duración ha terminado.
  prune(t) {
    const n = this.events.filter((e) => e.endTime === Infinity || t < e.endTime);
    if (n.length !== this.events.length) {
      this.events = n;
      this.emit();
    }
  }

  isActive(ev, t) {
    return t >= ev.startTime && (ev.endTime === Infinity || t < ev.endTime);
  }

  activeEvents(t) {
    return this.events.filter((e) => this.isActive(e, t));
  }

  // ¿Está cerrado este carril en esta posición?
  isLaneClosed(pos, lane, t) {
    for (const ev of this.events) {
      if (!this.isActive(ev, t)) continue;
      if (!CLOSURE_TYPES.has(ev.type)) continue;
      if (!ev.affectedLanes || !ev.affectedLanes.includes(lane)) continue;
      if (pos >= ev.positionStart && pos <= ev.positionEnd) return true;
    }
    return false;
  }

  // Próximo cierre del carril por delante (para incorporación obligatoria).
  // Devuelve { dist, ev } o null. dist = 0 si el vehículo ya está dentro.
  nextClosureAhead(pos, lane, t, lookahead = 600) {
    let best = null;
    for (const ev of this.events) {
      if (!this.isActive(ev, t)) continue;
      if (!CLOSURE_TYPES.has(ev.type)) continue;
      if (!ev.affectedLanes || !ev.affectedLanes.includes(lane)) continue;
      if (ev.positionEnd < pos) continue;
      const dist = ev.positionStart - pos;
      if (dist > lookahead) continue;
      if (best === null || dist < best.rawDist) {
        best = { rawDist: dist, dist: Math.max(0, dist), ev };
      }
    }
    return best;
  }

  // Obstáculos físicos parados en un carril (vehículo detenido, accidente).
  obstaclesInLane(lane, t) {
    const out = [];
    for (const ev of this.events) {
      if (!this.isActive(ev, t)) continue;
      if (ev.type === "stopped_vehicle" && ev.blocksLane && ev.lane === lane) {
        out.push({ pos: ev.position, length: 4.6, speed: 0, isObstacle: true });
      }
      if (ev.type === "accident" && ev.affectedLanes?.includes(lane)) {
        out.push({
          pos: (ev.positionStart + ev.positionEnd) / 2,
          length: ev.positionEnd - ev.positionStart,
          speed: 0,
          isObstacle: true,
        });
      }
    }
    return out;
  }

  // Límite de velocidad adicional impuesto por eventos (obras).
  speedLimitAt(pos, t) {
    let lim = Infinity;
    for (const ev of this.events) {
      if (!this.isActive(ev, t)) continue;
      if (ev.type !== "roadworks" || !ev.speedLimit) continue;
      if (pos >= ev.positionStart - 150 && pos <= ev.positionEnd) {
        lim = Math.min(lim, ev.speedLimit);
      }
    }
    return lim;
  }

  // Factor (0..1] sobre la velocidad deseada del conductor: efecto mirón
  // (accidente visible) y vehículos en el arcén. Depende de su curiosidad.
  desiredSpeedFactor(vehicle, t) {
    let f = 1;
    for (const ev of this.events) {
      if (!this.isActive(ev, t)) continue;

      let red = 0;
      let vis = 0;
      let p = 0;
      if (ev.type === "rubbernecking") {
        vis = ev.visibilityDistance ?? 300;
        p = ev.position;
        red =
          lerp(ev.speedReductionMin ?? 0.1, ev.speedReductionMax ?? 0.4, vehicle.curiosity) *
          this.badocIntensity;
      } else if (ev.type === "accident" && ev.rubberneck) {
        vis = ev.visibilityDistance ?? 250;
        p = (ev.positionStart + ev.positionEnd) / 2;
        red = lerp(0.05, 0.3, vehicle.curiosity);
      } else if (ev.type === "stopped_vehicle" && !ev.blocksLane) {
        vis = ev.visibilityDistance ?? 250;
        p = ev.position;
        red = (1 - (ev.speedReductionFactor ?? 0.85)) * (0.5 + 0.5 * vehicle.curiosity);
      } else {
        continue;
      }

      const x = vehicle.pos;
      if (x > p + 40 || x < p - vis) continue;
      // Crece al acercarse al punto visible y se libera justo después.
      const w = x <= p ? clamp(1 - (p - x) / vis, 0, 1) : 1 - (x - p) / 40;
      f *= 1 - clamp(red, 0, 0.9) * Math.sqrt(Math.max(w, 0));
    }
    return f;
  }

  // ---------- Helpers de creación (x en metros, t = tiempo de simulación) ----------

  addBottleneck(x, t) {
    const lane = this.road.defaultLanes - 1;
    return this.add({
      type: "lane_closure",
      label: `Corte carril ${lane + 1}`,
      positionStart: x,
      positionEnd: x + 400,
      affectedLanes: [lane],
      startTime: t,
      endTime: Infinity,
    });
  }

  addStoppedVehicle(x, t, duration = 240) {
    const lane = this.road.defaultLanes - 1;
    return this.add({
      type: "stopped_vehicle",
      label: `Vehículo parado (carril ${lane + 1})`,
      position: x,
      lane,
      blocksLane: true,
      visibilityDistance: 300,
      startTime: t,
      endTime: t + duration,
    });
  }

  addShoulderVehicle(x, t, duration = 300) {
    return this.add({
      type: "stopped_vehicle",
      label: "Vehículo en arcén",
      position: x,
      lane: "shoulder",
      blocksLane: false,
      speedReductionFactor: 0.85,
      visibilityDistance: 250,
      startTime: t,
      endTime: t + duration,
    });
  }

  addAccident(x, t, duration = 300) {
    const lane = Math.max(0, this.road.defaultLanes - 2);
    return this.add({
      type: "accident",
      label: `Accidente (carril ${lane + 1})`,
      positionStart: x - 25,
      positionEnd: x + 15,
      affectedLanes: [lane],
      rubberneck: true,
      visibilityDistance: 250,
      startTime: t,
      endTime: t + duration,
    });
  }

  addBadoc(x, t, duration = 300) {
    return this.add({
      type: "rubbernecking",
      label: "Efecto badoc (sentido contrario)",
      position: x,
      affectedDirection: "opposite",
      visibilityDistance: 350,
      speedReductionMin: 0.12,
      speedReductionMax: 0.45,
      startTime: t,
      endTime: t + duration,
    });
  }

  addRoadworks(x, t, duration = 600) {
    return this.add({
      type: "roadworks",
      label: "Obras (60 km/h)",
      positionStart: x,
      positionEnd: x + 600,
      affectedLanes: [],
      speedLimit: 60 / 3.6,
      startTime: t,
      endTime: t + duration,
    });
  }
}
