// Modelo de carretera: tramos configurables y geometría lógica de carriles.
// La carretera es recta a lo largo del eje X. El sentido simulado circula hacia +X.

export const LANE_WIDTH = 3.5;
export const MEDIAN_HALF = 1.0; // mitad de la mediana central
export const SHOULDER_WIDTH = 2.5; // arcén

export class Road {
  constructor({ length = 5000, defaultLanes = 3, speedLimitKmh = 120 } = {}) {
    this.length = length;
    this.defaultLanes = defaultLanes;
    this.speedLimit = speedLimitKmh / 3.6; // m/s interno
    this.segmentLength = 500;
    this.rebuildSegments();
  }

  rebuildSegments() {
    this.segments = [];
    let i = 0;
    for (let s = 0; s < this.length; s += this.segmentLength, i++) {
      this.segments.push({
        id: `segment_${String(i).padStart(3, "0")}`,
        start: s,
        end: Math.min(s + this.segmentLength, this.length),
        lanes: this.defaultLanes,
        speedLimit: this.speedLimit,
        type: "normal",
        incidents: [],
      });
    }
  }

  segmentAt(pos) {
    const idx = Math.min(
      this.segments.length - 1,
      Math.max(0, Math.floor(pos / this.segmentLength))
    );
    return this.segments[idx];
  }

  lanesAt(pos) {
    return this.segmentAt(pos).lanes;
  }

  speedLimitAt(pos) {
    return this.segmentAt(pos).speedLimit;
  }

  // Centro del carril en Z para el sentido simulado (carril 0 = junto a la mediana).
  // Acepta valores fraccionarios (animación de cambio de carril) y "shoulder".
  laneCenterZ(lane) {
    if (lane === "shoulder") {
      return MEDIAN_HALF + this.defaultLanes * LANE_WIDTH + SHOULDER_WIDTH / 2;
    }
    return MEDIAN_HALF + (lane + 0.5) * LANE_WIDTH;
  }

  carriagewayWidth() {
    return this.defaultLanes * LANE_WIDTH + SHOULDER_WIDTH;
  }
}
