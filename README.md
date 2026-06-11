# 🚗 Simulador 3D de retenciones de tráfico

Simulador web 3D de tráfico basado en agentes, desarrollado con HTML, CSS,
JavaScript y [Three.js](https://threejs.org/). Permite observar cómo pequeñas
alteraciones (un corte de carril, un coche parado, un accidente visible en el
sentido contrario…) provocan retenciones, ondas de frenada y congestión
acumulada en una autopista de varios carriles.

## Cómo ejecutarlo

**Abre `index.html` con doble clic** en un navegador moderno. No necesita
backend, base de datos, conexión a internet ni servidor: `index.html` carga
el paquete ya construido en `dist/bundle.js` (Three.js incluido).

### Para desarrollar

El código fuente está en `js/*.js` como módulos ES. Los módulos no funcionan
con `file://`, así que para trabajar sobre las fuentes usa `dev.html` con un
servidor estático cualquiera:

```bash
# opción 1 (Python)
python3 -m http.server 8000
# opción 2 (Node)
npx serve .
```

y abre `http://localhost:8000/dev.html`. Cuando termines, regenera el
paquete de `index.html` con:

```bash
npm run build
```

## Qué se puede hacer

- **Escenario inicial**: autopista de 5 km con 3 carriles y un cuello de
  botella de 3→2 carriles entre el km 2,2 y el km 2,6. Con el flujo por
  defecto se forma una retención antes del estrechamiento que se propaga
  hacia atrás.
- **Cámara**: rotar (arrastrar), zoom (rueda), pan (botón derecho) y
  desplazamiento longitudinal con `←`/`→` o `A`/`D`. El botón «Vista» alterna
  entre vista general, cercana y cenital.
- **Eventos** (se colocan en el punto que mira la cámara):
  - ⛔ Cuello de botella (corte del carril derecho durante 400 m)
  - 🚙 Vehículo parado en un carril / 🅿️ en el arcén (efecto parcial)
  - 💥 Accidente con bloqueo de carril y efecto mirón
  - 👀 Efecto badoc: accidente en el sentido contrario que hace que los
    conductores curiosos levanten el pie (el tráfico contrario también se
    detiene tras su accidente)
  - 🛑 Frenada brusca: perturbación puntual que genera retenciones fantasma
  - 🚧 Obras con velocidad limitada a 60 km/h
- **Parámetros**: flujo de entrada (veh/h), porcentaje de camiones, número de
  carriles, velocidad máxima, agresividad media, intensidad del efecto badoc,
  lluvia, adelantamiento de camiones y velocidad de simulación.
- **Métricas en tiempo real**: velocidad media, vehículos activos y
  detenidos, longitud de cola actual y máxima, caudal en un punto de aforo,
  densidad, tiempo perdido acumulado y tiempo medio de viaje.

## Modelo de tráfico

Cada vehículo es un agente individual con velocidad deseada, aceleración,
frenada, distancia y tiempo de seguridad, tiempo de reacción, agresividad y
curiosidad propios.

- **Seguimiento**: modelo IDM (*Intelligent Driver Model*), que reproduce de
  forma natural el efecto acordeón y las retenciones fantasma.
- **Cambios de carril**: criterio de incentivo + seguridad (estilo MOBIL) con
  sesgo de volver al carril derecho; las incorporaciones ante un corte de
  carril son obligatorias y relajan progresivamente los huecos aceptados.
- **Arranque progresivo**: tras una parada total, cada conductor tarda su
  tiempo de reacción en arrancar, lo que mantiene la onda de congestión
  aunque la causa haya desaparecido.
- **Unidades internas**: metros, segundos y m/s (km/h solo en la interfaz).

## Estructura

```text
index.html        — página y panel de control
css/style.css     — estilos
js/main.js        — escena Three.js, render y conexión simulación↔visual
js/simulation.js  — núcleo de la simulación y métricas (sin Three.js)
js/road.js        — tramos, carriles y geometría lógica de la carretera
js/vehicle.js     — clase Vehicle (agente) y modelo IDM
js/events.js      — gestor de eventos/incidencias
js/ui.js          — panel de control e indicadores
js/utils.js       — utilidades y conversión de unidades
```

La simulación está completamente separada de la visualización: los módulos
`simulation/road/vehicle/events` no importan Three.js y pueden ejecutarse en
Node para hacer pruebas sin navegador.

## Colores de congestión

| Color       | Estado     | Velocidad media |
| ----------- | ---------- | --------------- |
| 🟢 Verde    | Fluido     | > 80 km/h       |
| 🟡 Amarillo | Denso      | 40–80 km/h      |
| 🟠 Naranja  | Congestión | 10–40 km/h      |
| 🔴 Rojo     | Retención  | < 10 km/h       |

Se aplican tanto a los vehículos como al mapa de calor por tramos de 100 m
pintado sobre la calzada.
