// Clase Vehicle: cada vehículo es un agente con sus propios parámetros de
// conducción. El modelo de seguimiento es IDM (Intelligent Driver Model),
// que reproduce de forma natural frenadas en cadena y retenciones fantasma.

import { clamp, rand, randn } from "./utils.js";

let nextVehicleId = 1;

export class Vehicle {
  constructor(opts) {
    Object.assign(this, opts);
    this.id = `vehicle_${String(nextVehicleId++).padStart(4, "0")}`;
    this.speed ??= 0;
    this.acc = 0;
    this.laneVis = this.lane; // posición lateral animada (en carriles)
    this.changeCooldown = 0;
    this.forcedBrakeTime = 0;
    this.forcedBrakeDecel = 0;
    this.startDelay = -1; // retardo de reacción pendiente al arrancar (-1 = inactivo)
    this.recovery = 0; // "conducción prudente" tras una frenada fuerte
    this.spawnTime = 0;
    this.prevPos = this.pos;
  }

  get front() {
    return this.pos + this.length / 2;
  }

  get rear() {
    return this.pos - this.length / 2;
  }

  // settings: { avgDesiredSpeed (m/s), aggressiveness (0..1) }
  static create(type, lane, pos, settings) {
    const agg = clamp(randn(settings.aggressiveness, 0.18), 0, 1);
    const curiosity = Math.pow(Math.random(), 1.5);

    if (type === "truck") {
      return new Vehicle({
        type,
        lane,
        pos,
        length: rand(12, 16.5),
        width: 2.5,
        desiredSpeed: rand(82, 92) / 3.6,
        aMax: rand(0.7, 1.1),
        bComf: rand(1.8, 2.4),
        bMax: 6.5,
        s0: rand(3, 4),
        T: Math.max(1.2, rand(1.7, 2.3) - 0.3 * agg),
        reactionTime: rand(0.9, 1.8),
        aggressiveness: agg,
        curiosity,
      });
    }

    return new Vehicle({
      type: "car",
      lane,
      pos,
      length: rand(4.1, 4.9),
      width: 1.8,
      desiredSpeed: clamp(
        randn(settings.avgDesiredSpeed * (0.92 + 0.16 * agg), 8 / 3.6),
        90 / 3.6,
        150 / 3.6
      ),
      aMax: rand(1.6, 2.4) + 0.6 * agg,
      bComf: rand(2.2, 3.0),
      bMax: 8,
      s0: rand(1.8, 2.8),
      T: Math.max(0.7, rand(1.1, 1.7) - 0.5 * agg),
      reactionTime: Math.max(0.4, rand(0.7, 1.6) - 0.3 * agg),
      aggressiveness: agg,
      curiosity,
    });
  }

  // Aceleración IDM. gap = hueco libre hasta el líder (null si no hay líder).
  // Textra permite aumentar el intervalo de seguridad (p. ej. lluvia).
  idmAcc(v0, gap, leadSpeed = 0, Textra = 0) {
    const free = 1 - Math.pow(this.speed / Math.max(v0, 0.5), 4);
    let acc = this.aMax * free;
    if (gap != null) {
      const dv = this.speed - leadSpeed;
      const T = this.T + Textra;
      const sStar =
        this.s0 +
        Math.max(
          0,
          this.speed * T + (this.speed * dv) / (2 * Math.sqrt(this.aMax * this.bComf))
        );
      acc = this.aMax * (free - (sStar / Math.max(gap, 0.2)) ** 2);
    }
    return clamp(acc, -this.bMax, this.aMax);
  }
}
