// Inicializa Three.js, conecta la simulación (datos) con la visualización 3D
// y gestiona cámara, bucle principal y creación de eventos desde la UI.

import * as THREE from "three";
import { OrbitControls } from "../lib/OrbitControls.js";
import { Road, LANE_WIDTH, MEDIAN_HALF, SHOULDER_WIDTH } from "./road.js";
import { EventManager } from "./events.js";
import { Simulation } from "./simulation.js";
import { initUI, updateMetricsUI } from "./ui.js";
import { speedColorHex, clamp, rand } from "./utils.js";

// ---------------------------------------------------------------- modelo ---

const road = new Road({ length: 5000, defaultLanes: 3, speedLimitKmh: 120 });
const events = new EventManager(road);
const sim = new Simulation(road, events);

const state = { running: true, simSpeed: 1, viewIndex: 0 };

// Escenario inicial: cuello de botella de 3 a 2 carriles (km 2,2 - 2,6).
function loadDefaultScenario() {
  events.clearAll();
  events.addBottleneck(2200, 0);
  sim.reset(true);
}

// ----------------------------------------------------------------- escena ---

const viewport = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY_DAY = 0xbfd8ee;
const SKY_RAIN = 0x8a97a5;
scene.background = new THREE.Color(SKY_DAY);
scene.fog = new THREE.Fog(SKY_DAY, 700, 2800);

const camera = new THREE.PerspectiveCamera(55, 1, 1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.45;
controls.minDistance = 15;
controls.maxDistance = 1600;

scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5f3a, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(300, 500, 200);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(road.length + 2400, 1800),
  new THREE.MeshLambertMaterial({ color: 0x2c5e2e })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(road.length / 2, -0.12, 0);
scene.add(ground);

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ------------------------------------------------------- carretera (visual) ---

let roadGroup = null;
let heatMesh = null;
let heatBins = 0;
const HEAT_BIN = 100;

function buildRoadVisuals() {
  if (roadGroup) scene.remove(roadGroup);
  roadGroup = new THREE.Group();

  const L = road.length;
  const lanesW = road.defaultLanes * LANE_WIDTH;
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });
  const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x474f57 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });

  for (const side of [1, -1]) {
    const lanesBox = new THREE.Mesh(new THREE.BoxGeometry(L, 0.2, lanesW), asphalt);
    lanesBox.position.set(L / 2, -0.1, side * (MEDIAN_HALF + lanesW / 2));
    roadGroup.add(lanesBox);

    const sh = new THREE.Mesh(new THREE.BoxGeometry(L, 0.2, SHOULDER_WIDTH), shoulderMat);
    sh.position.set(L / 2, -0.1, side * (MEDIAN_HALF + lanesW + SHOULDER_WIDTH / 2));
    roadGroup.add(sh);

    // Líneas continuas de borde
    for (const z of [MEDIAN_HALF + 0.15, MEDIAN_HALF + lanesW - 0.15]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.02, 0.18), lineMat);
      edge.position.set(L / 2, 0.02, side * z);
      roadGroup.add(edge);
    }
  }

  // Líneas discontinuas entre carriles
  const dashEvery = 12;
  const nDash = Math.floor(L / dashEvery);
  const boundaries = road.defaultLanes - 1;
  const dashes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(4, 0.02, 0.16),
    lineMat,
    nDash * boundaries * 2
  );
  const dummy = new THREE.Object3D();
  let di = 0;
  for (const side of [1, -1]) {
    for (let b = 1; b <= boundaries; b++) {
      const z = side * (MEDIAN_HALF + b * LANE_WIDTH);
      for (let i = 0; i < nDash; i++) {
        dummy.position.set(i * dashEvery + 6, 0.02, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        dashes.setMatrixAt(di++, dummy.matrix);
      }
    }
  }
  dashes.instanceMatrix.needsUpdate = true;
  roadGroup.add(dashes);

  // Mediana
  const median = new THREE.Mesh(
    new THREE.BoxGeometry(L, 0.9, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a6 })
  );
  median.position.set(L / 2, 0.45, 0);
  roadGroup.add(median);

  // Tiras de "mapa de calor" sobre el sentido simulado
  heatBins = Math.ceil(L / HEAT_BIN);
  heatMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(HEAT_BIN - 4, lanesW),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false }),
    heatBins
  );
  for (let i = 0; i < heatBins; i++) {
    dummy.position.set(i * HEAT_BIN + HEAT_BIN / 2, 0.06, MEDIAN_HALF + lanesW / 2);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    heatMesh.setMatrixAt(i, dummy.matrix);
    heatMesh.setColorAt(i, new THREE.Color(0x3a3f44));
  }
  heatMesh.instanceMatrix.needsUpdate = true;
  heatMesh.frustumCulled = false;
  roadGroup.add(heatMesh);

  scene.add(roadGroup);
}

// ------------------------------------------------------- vehículos (visual) ---

const MAX_CARS = 1500;
const MAX_TRUCKS = 500;
const vehDummy = new THREE.Object3D();
const vehColor = new THREE.Color();

function makeVehicleMesh(max) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    max
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}
const carMesh = makeVehicleMesh(MAX_CARS);
const truckMesh = makeVehicleMesh(MAX_TRUCKS);

function syncVehicles() {
  let ci = 0;
  let ti = 0;
  for (const v of sim.vehicles) {
    const isTruck = v.type === "truck";
    if (isTruck && ti >= MAX_TRUCKS) continue;
    if (!isTruck && ci >= MAX_CARS) continue;
    const mesh = isTruck ? truckMesh : carMesh;
    const i = isTruck ? ti++ : ci++;
    const h = isTruck ? 3.4 : 1.45;
    vehDummy.position.set(v.pos, h / 2 + 0.05, road.laneCenterZ(v.laneVis));
    vehDummy.rotation.set(0, -(v.lane - v.laneVis) * 0.35, 0);
    vehDummy.scale.set(v.length, h, v.width);
    vehDummy.updateMatrix();
    mesh.setMatrixAt(i, vehDummy.matrix);
    vehColor.setHex(speedColorHex(v.speed * 3.6));
    if (isTruck) vehColor.multiplyScalar(0.8);
    mesh.setColorAt(i, vehColor);
  }
  carMesh.count = ci;
  truckMesh.count = ti;
  for (const mesh of [carMesh, truckMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------- eventos (visual) ---

const coneGeo = new THREE.CylinderGeometry(0.06, 0.26, 0.85, 8);
const coneMat = new THREE.MeshLambertMaterial({ color: 0xff7a2a });
const crashMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
const stoppedCarMat = new THREE.MeshLambertMaterial({ color: 0x8d2f2f });
const beaconMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
const signMat = new THREE.MeshLambertMaterial({ color: 0xe07a00 });

const eventsGroup = new THREE.Group();
scene.add(eventsGroup);

function addCone(group, x, z) {
  const c = new THREE.Mesh(coneGeo, coneMat);
  c.position.set(x, 0.42, z);
  group.add(c);
}

function addCrashedCars(group, x, z) {
  for (const [dx, yaw] of [
    [-3, 0.5],
    [3.5, -0.35],
  ]) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 1.8), crashMat);
    car.position.set(x + dx, 0.75, z + (dx > 0 ? 0.8 : -0.6));
    car.rotation.y = yaw;
    group.add(car);
  }
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), beaconMat);
  beacon.position.set(x - 3, 1.7, z - 0.6);
  group.add(beacon);
}

function buildEventGroup(ev) {
  const g = new THREE.Group();
  const lanesW = road.defaultLanes * LANE_WIDTH;

  if (ev.type === "lane_closure" || (ev.type === "roadworks" && ev.affectedLanes?.length)) {
    for (const lane of ev.affectedLanes) {
      const zOuter = MEDIAN_HALF + (lane + 1) * LANE_WIDTH;
      const zInner = lane > 0 ? MEDIAN_HALF + lane * LANE_WIDTH : zOuter;
      const zCones = lane > 0 ? zInner : MEDIAN_HALF + LANE_WIDTH;
      // Embudo de conos antes del cierre
      const taper = 120;
      for (let i = 0; i <= 10; i++) {
        const f = i / 10;
        addCone(g, ev.positionStart - taper + f * taper, zOuter + f * (zCones - zOuter));
      }
      // Conos a lo largo del carril cerrado
      for (let x = ev.positionStart; x <= ev.positionEnd; x += 25) addCone(g, x, zCones);
    }
  }

  if (ev.type === "roadworks") {
    for (let x = ev.positionStart; x <= ev.positionEnd; x += 30) {
      addCone(g, x, MEDIAN_HALF + 0.4);
      addCone(g, x + 15, MEDIAN_HALF + lanesW - 0.4);
    }
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), crashMat);
    pole.position.set(ev.positionStart - 30, 1.2, MEDIAN_HALF + lanesW + 1.2);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.2), signMat);
    panel.position.set(ev.positionStart - 30, 2.2, MEDIAN_HALF + lanesW + 1.2);
    g.add(pole, panel);
  }

  if (ev.type === "stopped_vehicle") {
    const z = road.laneCenterZ(ev.lane);
    const car = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 1.8), stoppedCarMat);
    car.position.set(ev.position, 0.75, z);
    g.add(car);
    addCone(g, ev.position - 14, z); // triángulo/cono de emergencia
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), beaconMat);
    beacon.position.set(ev.position, 1.65, z);
    g.add(beacon);
  }

  if (ev.type === "accident") {
    const z = road.laneCenterZ(ev.affectedLanes[0]);
    const mid = (ev.positionStart + ev.positionEnd) / 2;
    addCrashedCars(g, mid, z);
    for (let x = ev.positionStart - 15; x <= ev.positionEnd + 10; x += 8) {
      addCone(g, x, z - LANE_WIDTH / 2 + 0.3);
    }
  }

  if (ev.type === "rubbernecking") {
    // Accidente visible en el sentido contrario
    const z = -(MEDIAN_HALF + 1.5 * LANE_WIDTH);
    addCrashedCars(g, ev.position, z);
    for (let i = 0; i < 5; i++) addCone(g, ev.position - 16 + i * 8, z + 1.6);
  }

  return g;
}

function rebuildEventVisuals() {
  eventsGroup.clear();
  for (const ev of events.events) {
    eventsGroup.add(buildEventGroup(ev));
  }
}
events.onChange(rebuildEventVisuals);

// ----------------------------------------- tráfico decorativo en sentido contrario ---

const opposite = {
  items: [],
  mesh: makeVehicleMesh(80),

  reinit() {
    this.items = [];
    for (let i = 0; i < 40; i++) {
      const truck = Math.random() < 0.2;
      this.items.push({
        lane: i % road.defaultLanes,
        pos: rand(0, road.length),
        speed: truck ? rand(20, 24) : rand(26, 33),
        length: truck ? rand(12, 16) : rand(4.1, 4.9),
        width: truck ? 2.5 : 1.8,
        height: truck ? 3.4 : 1.45,
        gap: rand(14, 26),
      });
    }
  },

  update(dt, t) {
    const blocks = events
      .activeEvents(t)
      .filter((e) => e.type === "rubbernecking")
      .map((e) => e.position);
    for (let l = 0; l < road.defaultLanes; l++) {
      const list = this.items.filter((it) => it.lane === l).sort((a, b) => a.pos - b.pos);
      let prevX = -Infinity;
      for (const it of list) {
        let target = it.pos - it.speed * dt;
        for (const b of blocks) {
          if (it.pos > b + 5 && target < b + 14) target = Math.max(target, b + 14);
        }
        if (target < prevX + it.gap) target = prevX + it.gap;
        if (target < -60) {
          it.pos = road.length + rand(0, 400);
        } else {
          it.pos = target;
          prevX = it.pos + it.length;
        }
      }
    }
  },

  sync() {
    let i = 0;
    for (const it of this.items) {
      vehDummy.position.set(
        it.pos,
        it.height / 2 + 0.05,
        -(MEDIAN_HALF + (it.lane + 0.5) * LANE_WIDTH)
      );
      vehDummy.rotation.set(0, 0, 0);
      vehDummy.scale.set(it.length, it.height, it.width);
      vehDummy.updateMatrix();
      this.mesh.setMatrixAt(i, vehDummy.matrix);
      vehColor.setHex(0x90a4ae);
      this.mesh.setColorAt(i, vehColor);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  },
};
opposite.reinit();

// ----------------------------------------------------------------- cámara ---

const VIEWS = [
  { name: "general", off: new THREE.Vector3(-280, 240, 300) },
  { name: "cercana", off: new THREE.Vector3(-70, 28, 80) },
  { name: "cenital", off: new THREE.Vector3(-2, 480, 2) },
];

function applyView() {
  const v = VIEWS[state.viewIndex];
  camera.position.copy(controls.target).add(v.off);
  return v.name;
}

controls.target.set(2300, 0, MEDIAN_HALF + (road.defaultLanes * LANE_WIDTH) / 2);
applyView();

const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function moveCameraAlongRoad(dtReal) {
  let dir = 0;
  if (keys.has("arrowright") || keys.has("d")) dir += 1;
  if (keys.has("arrowleft") || keys.has("a")) dir -= 1;
  if (!dir) return;
  const speed = clamp(camera.position.distanceTo(controls.target), 80, 800);
  const dx = dir * speed * dtReal;
  const nx = clamp(controls.target.x + dx, 0, road.length);
  camera.position.x += nx - controls.target.x;
  controls.target.x = nx;
}

// Punto donde se colocan los eventos: el centro de la vista actual.
function placeX() {
  return clamp(Math.round(controls.target.x), 150, road.length - 700);
}

// -------------------------------------------------------------- interfaz ---

const app = {
  toggleRun() {
    state.running = !state.running;
    return state.running;
  },

  reset() {
    loadDefaultScenario();
  },

  addEvent(type) {
    const x = placeX();
    const t = sim.time;
    switch (type) {
      case "bottleneck":
        events.addBottleneck(x, t);
        break;
      case "stopped_vehicle":
        events.addStoppedVehicle(x, t);
        break;
      case "shoulder_vehicle":
        events.addShoulderVehicle(x, t);
        break;
      case "accident":
        events.addAccident(x, t);
        break;
      case "rubbernecking":
        events.addBadoc(x, t);
        break;
      case "roadworks":
        events.addRoadworks(x, t);
        break;
      case "sudden_braking":
        sim.triggerSuddenBrake(x);
        break;
    }
  },

  removeEvent(id) {
    events.remove(id);
  },

  clearEvents() {
    events.clearAll();
  },

  cycleView() {
    state.viewIndex = (state.viewIndex + 1) % VIEWS.length;
    return applyView();
  },

  set(key, value) {
    switch (key) {
      case "vehiclesPerHour":
      case "truckPercentage":
      case "trucksCanOvertake":
      case "aggressiveness":
        sim.settings[key] = value;
        break;
      case "rain": {
        sim.settings.rain = value;
        const sky = value ? SKY_RAIN : SKY_DAY;
        scene.background.setHex(sky);
        scene.fog.color.setHex(sky);
        scene.fog.far = value ? 1900 : 2800;
        break;
      }
      case "badocIntensity":
        events.badocIntensity = value;
        break;
      case "simSpeed":
        state.simSpeed = value;
        break;
      case "speedLimitKmh":
        road.speedLimit = value / 3.6;
        road.rebuildSegments();
        break;
      case "lanes":
        road.defaultLanes = value;
        road.rebuildSegments();
        buildRoadVisuals();
        opposite.reinit();
        loadDefaultScenario();
        break;
    }
  },
};

// -------------------------------------------------------------- arranque ---

buildRoadVisuals();
loadDefaultScenario();
initUI(app, events);
resize();

const heatColor = new THREE.Color();
function updateHeatmap() {
  if (!heatMesh) return;
  const speeds = sim.binSpeeds(HEAT_BIN);
  for (let i = 0; i < heatBins; i++) {
    // Solo se resaltan los tramos no fluidos; el resto conserva el asfalto.
    const tint = speeds[i] != null && speeds[i] <= 80;
    heatColor.setHex(tint ? speedColorHex(speeds[i]) : 0x3a3f44);
    heatMesh.setColorAt(i, heatColor);
  }
  if (heatMesh.instanceColor) heatMesh.instanceColor.needsUpdate = true;
}

const STEP = 1 / 30;
let last = performance.now();
let acc = 0;
let metricsTimer = 0;
let heatTimer = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (state.running) {
    acc += dtReal * state.simSpeed;
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      sim.update(STEP);
      opposite.update(STEP, sim.time);
      acc -= STEP;
      steps++;
    }
    if (steps === 12) acc = 0;
  }

  syncVehicles();
  opposite.sync();

  // Luz de emergencia parpadeante
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
  beaconMat.color.setHSL(0.6, 1, 0.25 + 0.45 * pulse);

  heatTimer += dtReal;
  if (heatTimer > 0.6) {
    heatTimer = 0;
    updateHeatmap();
  }

  metricsTimer += dtReal;
  if (metricsTimer > 0.25) {
    metricsTimer = 0;
    updateMetricsUI(sim.metricsSnapshot());
  }

  moveCameraAlongRoad(dtReal);
  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
