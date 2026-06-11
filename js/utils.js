// Utilidades compartidas. Unidades internas: metros, segundos, m/s.

export const MS_TO_KMH = 3.6;

export function clamp(x, a, b) {
  return Math.min(b, Math.max(a, x));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

// Aproximación de una normal (suma de uniformes), acotada a ±3 sigma.
export function randn(mean = 0, sd = 1) {
  const r = Math.random() + Math.random() + Math.random();
  return mean + (r - 1.5) * 2 * sd;
}

export function fmtTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDist(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

// Color según velocidad (km/h): verde fluido, amarillo denso, naranja congestión, rojo parado.
export function speedColorHex(kmh) {
  if (kmh > 80) return 0x2ecc71;
  if (kmh > 40) return 0xf1c40f;
  if (kmh > 10) return 0xe67e22;
  return 0xe74c3c;
}
