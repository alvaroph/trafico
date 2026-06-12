// Núcleo de la simulación: actualiza los vehículos (agentes), aplica los
// eventos, gestiona cambios de carril e incorporaciones obligatorias y
// calcula las métricas. No contiene nada de Three.js.

import { Vehicle } from "./vehicle.js";
import { clamp, rand } from "./utils.js";

const SLOW = 10 / 3.6; // umbral de "detenido" (10 km/h)
const MERGE_LOOKAHEAD = 600; // distancia a la que se anticipa un cierre de carril

export class Simulation {
  constructor(road, events, settings = {}) {
    this.road = road;
    this.events = events;
    this.settings = Object.assign(
      {
        vehiclesPerHour: 3000,
        truckPercentage: 15,
        aggressiveness: 0.5, // 0..1
        trucksCanOvertake: true,
        rain: false,
        avgDesiredSpeed: 118 / 3.6,
        maxVehicles: 1200,
      },
      settings
    );
    this.detectorX = Math.min(3000, road.length * 0.6);
    this.reset(true);
  }

  reset(prefill = true) {
    this.time = 0;
    this.vehicles = [];
    this.spawnDebt = 0;
    this.completed = 0;
    this.totalLost = 0;
    this.totalTravel = 0;
    this.detectorTimes = [];
    this.queueNow = 0;
    this.maxQueue = 0;
    this.queueEpisodeStart = -1;
    this.lastDissipation = null;
    this.metricsTimer = 0;
    if (prefill) this.prefill();
  }

  // Población inicial coherente con el flujo configurado.
  prefill() {
    const s = this.settings;
    const v = Math.min(s.avgDesiredSpeed, this.road.speedLimit) * 0.9;
    const perLaneFlow = s.vehiclesPerHour / this.road.defaultLanes / 3600;
    const spacing = Math.max(v / Math.max(perLaneFlow, 1e-6), 30);
    for (let lane = 0; lane < this.road.defaultLanes; lane++) {
      let x = rand(20, spacing);
      while (x < this.road.length - 50) {
        if (!this.events.isLaneClosed(x, lane, 0)) {
          const veh = Vehicle.create(this.pickType(lane), lane, x, s);
          veh.speed = Math.min(veh.desiredSpeed, this.road.speedLimit) * rand(0.85, 1);
          this.vehicles.push(veh);
        }
        x += spacing * rand(0.7, 1.4);
      }
    }
  }

  pickType(lane) {
    let p = this.settings.truckPercentage / 100;
    if (lane === 0 && this.road.defaultLanes >= 3) p *= 0.15;
    if (lane === this.road.defaultLanes - 1) p *= 1.6;
    return Math.random() < Math.min(p, 0.95) ? "truck" : "car";
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.events.prune(t);
    this.spawn(dt);

    let lanes = this.buildLaneLists(t);
    this.laneChanges(lanes, dt, t);
    lanes = this.buildLaneLists(t); // líderes coherentes tras los cambios

    for (let l = 0; l < lanes.length; l++) {
      const list = lanes[l];
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (v.isObstacle || v.lane !== l) continue; // entradas "fantasma" de cambio de carril
        this.updateVehicle(v, list[i + 1] ?? null, dt, t);
      }
    }

    // Integración, detector de caudal y salida de la carretera.
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.prevPos = v.pos;
      v.speed = Math.max(0, v.speed + v.acc * dt);
      v.pos += v.speed * dt;
      v.laneVis += clamp(v.lane - v.laneVis, -dt / 1.4, dt / 1.4);
      if (v.prevPos < this.detectorX && v.pos >= this.detectorX) {
        this.detectorTimes.push(t);
      }
      if (v.rear > this.road.length) {
        const travel = t - v.spawnTime;
        const ideal = this.road.length / Math.min(v.desiredSpeed, this.road.speedLimit);
        this.completed++;
        this.totalTravel += travel;
        this.totalLost += Math.max(0, travel - ideal);
        this.vehicles.splice(i, 1);
      }
    }

    this.preventOverlap(t);

    this.metricsTimer += dt;
    if (this.metricsTimer >= 0.5) {
      this.metricsTimer = 0;
      this.updateQueueStats(t);
    }
  }

  // Listas por carril ordenadas por posición (incluyendo obstáculos de eventos).
  // Un vehículo a medio cambio de carril ocupa también su carril de origen.
  buildLaneLists(t) {
    const n = this.road.defaultLanes;
    const lanes = Array.from({ length: n }, () => []);
    for (const v of this.vehicles) {
      lanes[v.lane].push(v);
      const visLane = Math.round(v.laneVis);
      if (visLane !== v.lane && visLane >= 0 && visLane < n) lanes[visLane].push(v);
    }
    for (let l = 0; l < n; l++) {
      for (const ob of this.events.obstaclesInLane(l, t)) lanes[l].push(ob);
      lanes[l].sort((a, b) => a.pos - b.pos);
    }
    return lanes;
  }

  effectiveV0(v, t) {
    const limit = Math.min(
      this.road.speedLimitAt(v.pos),
      this.events.speedLimitAt(v.pos, t)
    );
    let v0 = Math.min(v.desiredSpeed, limit) * this.events.desiredSpeedFactor(v, t);
    if (this.settings.rain) v0 *= 0.85;
    return Math.max(v0, 1);
  }

  updateVehicle(v, leader, dt, t) {
    const v0 = this.effectiveV0(v, t);
    // Tras una frenada fuerte el conductor mantiene más distancia unos
    // segundos: esto amplifica y sostiene las ondas de frenada (retención
    // fantasma) en lugar de disiparlas al instante.
    let Textra = this.settings.rain ? 0.4 : 0;
    if (v.recovery > 0) Textra += 0.4 * (1 - v.aggressiveness * 0.5);

    let gap = null;
    let leadSpeed = 0;
    if (leader) {
      gap = leader.pos - (leader.length ?? 4.5) / 2 - v.front;
      leadSpeed = leader.speed ?? 0;
    }

    // Cierre de carril por delante: si aún no ha podido incorporarse, debe
    // poder detenerse antes de los conos (líder virtual parado).
    const closure = this.events.nextClosureAhead(v.pos, v.lane, t, MERGE_LOOKAHEAD);
    if (closure && closure.rawDist > 0) {
      const cGap = closure.ev.positionStart - 8 - v.front;
      if (gap === null || cGap < gap) {
        gap = cGap;
        leadSpeed = 0;
      }
    }

    let acc = v.idmAcc(v0, gap, leadSpeed, Textra);

    // Frenada brusca forzada (perturbación manual).
    if (v.forcedBrakeTime > 0) {
      v.forcedBrakeTime -= dt;
      acc = Math.min(acc, -v.forcedBrakeDecel);
    }

    // Actualiza la fase de recuperación y reacelera con prudencia.
    if (acc < -2) v.recovery = 4;
    else v.recovery = Math.max(0, v.recovery - dt);
    if (v.recovery > 0 && acc > 0) acc = Math.min(acc, v.aMax * 0.45);

    // Arranque progresivo: tras una parada, cada conductor tarda su tiempo
    // de reacción en arrancar. Esto propaga la onda de congestión hacia atrás.
    if (v.speed < 0.3) {
      if (acc > 0.05) {
        if (v.startDelay < 0) v.startDelay = v.reactionTime;
        v.startDelay -= dt;
        if (v.startDelay > 0) acc = 0;
      } else {
        v.startDelay = -1;
      }
    } else {
      v.startDelay = -1;
    }

    v.acc = acc;
  }

  laneChanges(lanes, dt, t) {
    const s = this.settings;
    const nLanes = this.road.defaultLanes;

    for (const v of this.vehicles) {
      v.changeCooldown = Math.max(0, v.changeCooldown - dt);
      if (Math.abs(v.laneVis - v.lane) > 0.25) continue; // cambio anterior en curso

      const closure = this.events.nextClosureAhead(v.pos, v.lane, t, MERGE_LOOKAHEAD);
      const urgency = closure ? clamp(1 - closure.dist / MERGE_LOOKAHEAD, 0, 1) : 0;
      if (!closure && v.changeCooldown > 0) continue;

      const list = lanes[v.lane];
      const idx = list.indexOf(v);
      const leader = list[idx + 1] ?? null;

      // Carriles candidatos adyacentes.
      const candidates = [];
      for (const d of [-1, 1]) {
        const target = v.lane + d;
        if (target < 0 || target >= nLanes) continue;
        if (this.events.isLaneClosed(v.pos, target, t)) continue;
        const tc = this.events.nextClosureAhead(v.pos, target, t, MERGE_LOOKAHEAD);
        if (closure && tc && tc.dist <= closure.dist) continue; // no saltar a un carril que muere antes
        if (!closure && tc) continue;
        if (v.type === "truck" && !closure) {
          if (target === 0 && nLanes >= 3) continue; // camiones fuera del carril rápido
          if (d === -1 && !s.trucksCanOvertake) continue;
        }
        candidates.push(target);
      }
      if (!candidates.length) continue;

      const v0 = this.effectiveV0(v, t);
      const gapCur = leader
        ? leader.pos - (leader.length ?? 4.5) / 2 - v.front
        : null;
      let aCur = v.idmAcc(v0, gapCur, leader ? leader.speed ?? 0 : 0);
      if (closure) aCur -= 2 * urgency; // presión por abandonar un carril que se corta

      let best = null;
      for (const target of candidates) {
        const tl = lanes[target];
        let newLeader = null;
        let newFollower = null;
        for (const o of tl) {
          if (o === v) continue;
          if (o.pos >= v.pos) {
            newLeader = o;
            break;
          }
          newFollower = o;
        }
        const minGap = urgency > 0.5 ? 1 : 2;
        const gLead = newLeader
          ? newLeader.pos - (newLeader.length ?? 4.5) / 2 - v.front
          : null;
        if (gLead !== null && gLead < minGap) continue;
        if (newFollower) {
          const gFol = v.rear - (newFollower.pos + (newFollower.length ?? 4.5) / 2);
          if (gFol < minGap) continue;
          if (!newFollower.isObstacle) {
            // Seguridad: el nuevo seguidor no debe verse obligado a frenar fuerte.
            const fAcc = newFollower.idmAcc(newFollower.desiredSpeed, gFol, v.speed);
            const bSafe = 2 + 6 * urgency; // se relaja al acercarse al cierre
            if (fAcc < -bSafe) continue;
          }
        }
        const aNew = v.idmAcc(v0, gLead, newLeader ? newLeader.speed ?? 0 : 0);
        if (best === null || aNew > best.aNew) best = { target, aNew };
      }
      if (!best) continue;

      // Incentivo tipo MOBIL con sesgo de "volver al carril derecho".
      const rightBias = best.target > v.lane ? 0.25 : 0;
      const threshold = closure
        ? -10
        : 0.4 + (1 - v.aggressiveness) * 0.4 - rightBias;
      if (best.aNew - aCur > threshold) {
        v.lane = best.target;
        v.changeCooldown = closure ? 2 : 4 + (1 - v.aggressiveness) * 3;
      }
    }
  }

  // Red de seguridad: impide solapamientos aunque el integrador se quede corto.
  preventOverlap(t) {
    const lanes = this.buildLaneLists(t);
    for (let l = 0; l < lanes.length; l++) {
      const list = lanes[l];
      for (let i = list.length - 2; i >= 0; i--) {
        const v = list[i];
        if (v.isObstacle || v.lane !== l) continue;
        const lead = list[i + 1];
        const leadRear = lead.pos - (lead.length ?? 4.5) / 2;
        if (v.front > leadRear - 0.5) {
          v.pos = leadRear - 0.5 - v.length / 2;
          v.speed = Math.min(v.speed, lead.speed ?? 0);
        }
      }
    }
  }

  spawn(dt) {
    const s = this.settings;
    this.spawnDebt = Math.min(this.spawnDebt + (s.vehiclesPerHour / 3600) * dt, 25);
    while (this.spawnDebt >= 1) {
      if (this.vehicles.length >= s.maxVehicles) {
        this.spawnDebt = Math.min(this.spawnDebt, 2);
        break;
      }
      if (!this.trySpawn()) break;
      this.spawnDebt -= 1;
    }
  }

  trySpawn() {
    const t = this.time;
    const isTruck = Math.random() < this.settings.truckPercentage / 100;
    let bestLane = -1;
    let bestScore = -Infinity;
    let bestLead = null;

    for (let l = 0; l < this.road.defaultLanes; l++) {
      if (this.events.isLaneClosed(20, l, t)) continue;
      if (isTruck && l === 0 && this.road.defaultLanes >= 3) continue;
      let lead = null;
      for (const v of this.vehicles) {
        if (v.lane !== l) continue;
        if (lead === null || v.pos < lead.pos) lead = v;
      }
      const gap = lead ? lead.rear : Infinity;
      const score =
        Math.min(gap, 5000) +
        (isTruck ? l * 40 : (this.road.defaultLanes - 1 - l) * 8);
      if (score > bestScore) {
        bestScore = score;
        bestLane = l;
        bestLead = lead;
      }
    }

    if (bestLane < 0) return false;
    if (bestLead && bestLead.rear < 14) return false; // entrada bloqueada por la cola

    const veh = Vehicle.create(isTruck ? "truck" : "car", bestLane, 0, this.settings);
    veh.pos = veh.length / 2 + 0.5;
    veh.spawnTime = t;
    let sp = Math.min(veh.desiredSpeed, this.road.speedLimit) * 0.85;
    if (bestLead) {
      sp = Math.min(sp, bestLead.speed + Math.max(0, bestLead.rear - 14) * 0.3);
    }
    veh.speed = Math.max(sp, 0);
    this.vehicles.push(veh);
    return true;
  }

  // Frenada brusca: afecta al vehículo más cercano a x.
  triggerSuddenBrake(x, intensity = 0.8, duration = 6) {
    let best = null;
    let bestDist = 300;
    for (const v of this.vehicles) {
      const d = Math.abs(v.pos - x);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    if (best) {
      best.forcedBrakeTime = duration;
      best.forcedBrakeDecel = 4 + 4 * intensity;
    }
    return best !== null;
  }

  // Cola = tramo contiguo más largo de vehículos casi parados.
  updateQueueStats(t) {
    const slow = this.vehicles
      .filter((v) => v.speed < SLOW)
      .sort((a, b) => a.pos - b.pos);
    let best = 0;
    let runStart = null;
    let prev = null;
    for (const v of slow) {
      if (prev === null || v.pos - prev.pos > 80) runStart = v;
      best = Math.max(best, v.pos - runStart.pos + v.length);
      prev = v;
    }
    this.queueNow = best;
    this.maxQueue = Math.max(this.maxQueue, best);
    if (this.queueEpisodeStart < 0 && best > 150) this.queueEpisodeStart = t;
    if (this.queueEpisodeStart >= 0 && best < 30) {
      this.lastDissipation = t - this.queueEpisodeStart;
      this.queueEpisodeStart = -1;
    }
  }

  metricsSnapshot() {
    const n = this.vehicles.length;
    let sum = 0;
    let stopped = 0;
    for (const v of this.vehicles) {
      sum += v.speed;
      if (v.speed < SLOW) stopped++;
    }
    const t = this.time;
    const win = 120;
    while (this.detectorTimes.length && this.detectorTimes[0] < t - win) {
      this.detectorTimes.shift();
    }
    const elapsed = Math.min(win, Math.max(t, 30));
    return {
      time: t,
      vehicles: n,
      avgSpeedKmh: n ? (sum / n) * 3.6 : null,
      stopped,
      densityPerKm: n / (this.road.length / 1000),
      flowPerHour: (this.detectorTimes.length * 3600) / elapsed,
      queueM: this.queueNow,
      maxQueueM: this.maxQueue,
      lostMin: this.totalLost / 60,
      avgTravelMin: this.completed ? this.totalTravel / this.completed / 60 : null,
      dissipationS: this.lastDissipation,
    };
  }

  // Velocidad media por tramos de `size` metros (para el mapa de calor).
  binSpeeds(size = 100) {
    const bins = Math.ceil(this.road.length / size);
    const sums = new Float64Array(bins);
    const counts = new Uint16Array(bins);
    for (const v of this.vehicles) {
      const b = clamp(Math.floor(v.pos / size), 0, bins - 1);
      sums[b] += v.speed;
      counts[b]++;
    }
    const out = new Array(bins);
    for (let i = 0; i < bins; i++) {
      out[i] = counts[i] ? (sums[i] / counts[i]) * 3.6 : null;
    }
    return out;
  }
}
