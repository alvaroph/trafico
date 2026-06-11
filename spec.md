# Especificación del proyecto: Simulador 3D de retenciones de tráfico

## 1. Objetivo general

Desarrollar una aplicación web que permita simular el comportamiento del tráfico en una autopista o carretera de varios carriles, visualizando en 3D cómo se generan, evolucionan y desaparecen las retenciones.

El simulador debe permitir crear escenarios con alteraciones como:

* Reducción de carriles, por ejemplo de 3 carriles a 2.
* Vehículos parados en un carril o en el arcén.
* Muchos camiones circulando por un carril.
* Accidentes o incidencias en el mismo sentido.
* Accidentes visibles en el sentido contrario que generen “efecto badoc” o “efecto mirón”.
* Retenciones fantasma producidas por frenadas, paradas y arranques progresivos.
* Zonas de obras, estrechamientos, incorporaciones y salidas.

La idea principal no es solo mover coches por una carretera, sino observar cómo pequeñas alteraciones pueden provocar problemas colectivos de tráfico.

---

## 2. Tipo de aplicación

La aplicación debe ser una página web hecha con:

* HTML
* CSS
* JavaScript
* Three.js para la visualización 3D

Preferencia inicial:

* Sin backend.
* Sin base de datos.
* Sin React, Vue ni frameworks similares.
* Todo ejecutándose en el navegador.
* Puede estar organizado en varios ficheros JS, pero debe poder funcionar localmente.

Estructura recomendada:

```text
/index.html
/css/style.css
/js/main.js
/js/simulation.js
/js/road.js
/js/vehicle.js
/js/events.js
/js/ui.js
```

También es aceptable una primera versión más simple con:

```text
index.html
style.css
main.js
```

---

## 3. Visualización 3D

La carretera debe verse en 3D usando Three.js.

La escena debe incluir:

* Carretera.
* Carriles.
* Líneas de separación.
* Vehículos.
* Camiones.
* Obstáculos.
* Incidentes.
* Zonas de congestión.
* Cámara navegable.

El usuario debe poder:

* Hacer zoom.
* Hacer pan.
* Rotar ligeramente la cámara.
* Moverse longitudinalmente por la carretera.
* Observar el tráfico desde una vista elevada.
* Acercarse a una zona concreta para ver el comportamiento de los coches.

Se recomienda usar `OrbitControls` o un sistema equivalente de control de cámara.

La vista inicial puede ser una cámara elevada en perspectiva, mirando la carretera desde arriba y ligeramente inclinada.

---

## 4. Concepto de carretera infinita

La carretera debe parecer infinita o de longitud indefinida.

No es necesario generar una carretera infinita real en memoria. Lo correcto es usar segmentos.

La carretera se puede construir con tramos consecutivos:

```text
Tramo 1: km 0 a km 1 - 3 carriles
Tramo 2: km 1 a km 2 - 3 carriles
Tramo 3: km 2 a km 3 - 2 carriles
Tramo 4: km 3 a km 4 - 2 carriles
```

El simulador debe poder generar, mostrar y actualizar únicamente los segmentos relevantes:

* Segmentos cercanos a la cámara.
* Segmentos cercanos a los vehículos.
* Segmentos donde hay eventos activos.

La carretera debe poder crecer hacia adelante a medida que el usuario o la simulación avanzan.

---

## 5. Modelo de carretera

La carretera debe estar formada por tramos configurables.

Cada tramo puede tener estas propiedades:

```js
{
  id: "segment_001",
  start: 0,
  end: 1000,
  lanes: 3,
  speedLimit: 120,
  type: "normal",
  incidents: []
}
```

Propiedades deseables de cada tramo:

* Inicio en metros.
* Final en metros.
* Número de carriles.
* Velocidad máxima.
* Tipo de tramo:

  * normal
  * estrechamiento
  * obras
  * incorporación
  * salida
  * accidente
  * carril cortado
* Obstáculos asociados.
* Nivel de visibilidad.
* Factor de reducción de velocidad.
* Capacidad estimada del tramo.

---

## 6. Vehículos como agentes

Cada vehículo debe comportarse como un agente individual.

Cada vehículo debe tener como mínimo:

```js
{
  id: "vehicle_001",
  type: "car",
  position: 120,
  lane: 1,
  speed: 90,
  desiredSpeed: 120,
  acceleration: 2.0,
  braking: 4.0,
  length: 4.5,
  reactionTime: 1.2,
  safeDistance: 25,
  aggressiveness: 0.5,
  curiosity: 0.2
}
```

Tipos de vehículo iniciales:

* Coche.
* Camión.

Opcionales más adelante:

* Moto.
* Autobús.
* Vehículo de emergencia.

Diferencias entre vehículos:

### Coche

* Menor longitud.
* Mayor aceleración.
* Más facilidad para cambiar de carril.
* Velocidad deseada más alta.

### Camión

* Mayor longitud.
* Menor aceleración.
* Menor velocidad máxima.
* Mayor distancia de seguridad.
* Puede generar adelantamientos lentos.
* Puede reducir la capacidad efectiva de un carril.

---

## 7. Reglas básicas de circulación

Cada vehículo debe actualizarse en cada paso de simulación.

Reglas mínimas:

1. Si no hay vehículo cerca delante, acelera hasta su velocidad deseada o hasta el límite del tramo.
2. Si hay un vehículo delante demasiado cerca, reduce velocidad.
3. Si la distancia de seguridad no es suficiente, frena.
4. Si el carril actual está bloqueado o va muy lento, intenta cambiar de carril.
5. Si se aproxima una reducción de carriles, intenta incorporarse al carril válido.
6. Si pasa por una zona con accidente visible, puede reducir la velocidad.
7. Si sale de una parada o retención, acelera de forma progresiva, no instantánea.
8. Si es un camión, acelera más lentamente y ocupa más espacio.

---

## 8. Fenómenos que debe poder representar

### 8.1. Cuello de botella: de 3 carriles a 2

El simulador debe permitir crear un tramo donde la carretera pasa de 3 carriles a 2.

Debe observarse:

* Acumulación de coches antes del estrechamiento.
* Cambios de carril.
* Reducción de velocidad.
* Posible formación de cola.
* Propagación de la retención hacia atrás.

El sistema debe calcular:

* Velocidad media antes del estrechamiento.
* Velocidad media después.
* Longitud máxima de la cola.
* Tiempo que tarda en desaparecer la retención.
* Caudal antes y después del cuello de botella.

---

### 8.2. Vehículo parado en el carril derecho

El usuario debe poder colocar un vehículo parado en una posición concreta.

Parámetros:

```js
{
  type: "stopped_vehicle",
  position: 2500,
  lane: 2,
  duration: 600,
  visibilityDistance: 300,
  blocksLane: true
}
```

Debe generar:

* Frenadas.
* Cambios de carril.
* Reducción de capacidad.
* Posible retención.
* Efecto acordeón.

También debe poder colocarse en el arcén con efecto parcial:

```js
{
  lane: "shoulder",
  blocksLane: false,
  speedReductionFactor: 0.85
}
```

---

### 8.3. Muchos camiones en un carril

El simulador debe permitir configurar el porcentaje de camiones.

Ejemplo:

```js
{
  trafficFlow: 3000,
  truckPercentage: 35
}
```

Efectos esperados:

* Menor velocidad media.
* Adelantamientos lentos.
* Mayor ocupación de carretera.
* Menor aceleración tras una parada.
* Posible bloqueo parcial de carriles.

Debe poder configurarse si los camiones pueden adelantar o no.

```js
{
  trucksCanOvertake: true
}
```

---

### 8.4. Retenciones fantasma

El simulador debe poder mostrar retenciones generadas por pequeñas perturbaciones aunque no haya obstáculo permanente.

Ejemplo:

* Un coche frena fuerte.
* El coche de detrás frena más.
* Los siguientes coches frenan progresivamente.
* Algunos llegan a detenerse.
* La onda de retención se desplaza hacia atrás.

El simulador debe visualizar que:

```text
Dirección de los coches:       →
Dirección de la retención:     ←
```

Debe poder provocarse una perturbación manual:

```js
{
  type: "sudden_braking",
  position: 1800,
  lane: 1,
  intensity: 0.8,
  duration: 5
}
```

---

### 8.5. Parada total y reinicio progresivo

Debe simularse el caso real en que los coches han llegado a detenerse por completo y después reanudan la marcha lentamente.

El comportamiento no debe ser:

```text
Todos los coches pasan de 0 a 120 km/h instantáneamente.
```

Debe ser:

```text
Coche 1 arranca.
Coche 2 reacciona un poco después.
Coche 3 reacciona después.
Coche 4 reacciona después.
...
```

Esto debe generar una onda residual de congestión.

Cada vehículo debe tener un tiempo de reacción que retrase su arranque:

```js
reactionTime: 1.2
```

Esto permitirá observar que la retención puede mantenerse aunque la causa inicial haya desaparecido.

---

### 8.6. Efecto badoc / efecto mirón

Debe existir la posibilidad de colocar un accidente visible en el sentido contrario o en un lateral.

Aunque no bloquee el carril del usuario, debe provocar que algunos conductores reduzcan la velocidad por curiosidad.

Parámetros:

```js
{
  type: "rubbernecking",
  position: 3200,
  affectedDirection: "opposite",
  visibilityDistance: 400,
  speedReductionMin: 0.1,
  speedReductionMax: 0.4,
  duration: 900
}
```

Cada conductor puede tener una propiedad `curiosity`.

```js
curiosity: 0.0 // no mira
curiosity: 1.0 // reduce mucho la velocidad
```

Efecto esperado:

* Reducción parcial de velocidad.
* Frenadas suaves.
* Posible retención si el tráfico está cerca de la saturación.
* Cola sin obstáculo físico en el carril.

---

## 9. Eventos configurables

El simulador debe permitir introducir eventos manualmente.

Eventos mínimos:

| Evento                | Descripción                                    |
| --------------------- | ---------------------------------------------- |
| Reducción de carriles | Pasar de 3 carriles a 2, o de 2 a 1            |
| Vehículo parado       | Coche parado en carril o arcén                 |
| Accidente             | Bloqueo parcial o total                        |
| Obras                 | Zona con velocidad reducida                    |
| Camiones              | Aumento del porcentaje de camiones             |
| Frenada brusca        | Perturbación puntual                           |
| Efecto badoc          | Reducción de velocidad por accidente visible   |
| Incorporación         | Entrada de vehículos desde un lateral          |
| Salida saturada       | Vehículos intentando salir                     |
| Lluvia                | Menor velocidad y mayor distancia de seguridad |

Cada evento debe tener:

```js
{
  id: "event_001",
  type: "lane_closure",
  positionStart: 2000,
  positionEnd: 2600,
  startTime: 60,
  endTime: 600,
  affectedLanes: [2],
  intensity: 1
}
```

---

## 10. Panel de configuración

La interfaz debe permitir modificar valores principales.

Parámetros generales:

* Número inicial de carriles.
* Flujo de tráfico: vehículos por hora.
* Porcentaje de camiones.
* Velocidad máxima.
* Velocidad deseada media.
* Agresividad media de los conductores.
* Distancia de seguridad media.
* Tiempo de reacción medio.
* Intensidad del efecto badoc.
* Posibilidad de adelantar de los camiones.
* Densidad inicial de vehículos.
* Duración de la simulación.
* Velocidad de simulación.

Botones mínimos:

* Iniciar.
* Pausar.
* Reiniciar.
* Añadir cuello de botella.
* Añadir vehículo parado.
* Añadir accidente.
* Añadir efecto badoc.
* Añadir camiones.
* Limpiar eventos.
* Cambiar vista.

---

## 11. Métricas y resultados

El simulador debe mostrar datos en tiempo real.

Métricas mínimas:

| Métrica               | Descripción                                       |
| --------------------- | ------------------------------------------------- |
| Velocidad media       | Velocidad media global o por tramo                |
| Densidad              | Vehículos por kilómetro                           |
| Caudal                | Vehículos por hora que pasan por un punto         |
| Cola máxima           | Longitud máxima de la retención                   |
| Tiempo medio de viaje | Tiempo que tarda un vehículo en recorrer el tramo |
| Tiempo perdido        | Diferencia entre tiempo ideal y tiempo real       |
| Vehículos detenidos   | Número de vehículos con velocidad casi cero       |
| Tiempo de disipación  | Tiempo hasta volver a circulación normal          |

Debe poder mostrarse un resumen como:

```text
Velocidad media: 47 km/h
Vehículos detenidos: 32
Longitud de cola: 1.4 km
Tiempo perdido acumulado: 18 min
Caudal actual: 1850 vehículos/hora
```

Los números anteriores son solo ejemplo, no deben usarse como valores reales fijos.

---

## 12. Visualización de congestión

Además de los vehículos, debe representarse el estado del tráfico.

Formas posibles:

1. Cambiar color de la carretera por zonas.
2. Mostrar una barra lateral de densidad.
3. Mostrar un mapa de calor.
4. Mostrar vehículos en colores según velocidad.

Ejemplo de lógica:

```js
if (averageSpeed > 80) {
  status = "fluid";
} else if (averageSpeed > 40) {
  status = "dense";
} else if (averageSpeed > 10) {
  status = "congested";
} else {
  status = "stopped";
}
```

Colores sugeridos:

* Verde: tráfico fluido.
* Amarillo: tráfico denso.
* Naranja: congestión.
* Rojo: retención o parada.

---

## 13. Separación entre simulación y visualización

Es importante separar el modelo lógico de la representación 3D.

La simulación debe trabajar con datos:

```js
vehicle.position
vehicle.speed
vehicle.lane
vehicle.acceleration
```

Three.js solo debe representar esos datos visualmente:

```js
mesh.position.x = vehicle.position;
mesh.position.z = vehicle.lane * laneWidth;
```

No se debe mezclar toda la lógica de tráfico dentro del objeto visual 3D.

Estructura recomendada:

```text
simulation.js
- actualiza vehículos
- calcula distancias
- aplica eventos
- calcula métricas

road.js
- define tramos
- define carriles
- calcula geometría de carretera

vehicle.js
- define clase Vehicle
- define comportamiento básico

events.js
- define incidentes
- aplica efectos sobre vehículos

ui.js
- conecta botones y sliders

main.js
- inicializa Three.js
- conecta simulación y visualización
```

---

## 14. Modelo inicial recomendado

Para una primera versión funcional, no hace falta realismo perfecto.

Primera versión mínima:

1. Carretera recta en 3D.
2. Tres carriles.
3. Coches como cajas.
4. Camiones como cajas más largas.
5. Vehículos avanzando.
6. Distancia de seguridad básica.
7. Frenada si el vehículo de delante está cerca.
8. Cambio de carril simple.
9. Cuello de botella de 3 carriles a 2.
10. Cámara con pan, zoom y rotación.
11. Panel con velocidad media y vehículos detenidos.

Después ampliar.

---

## 15. Fases de desarrollo

### Fase 1: visualización básica

Objetivo:

* Crear escena 3D.
* Crear carretera recta.
* Crear carriles.
* Crear vehículos como cajas.
* Mover vehículos hacia adelante.
* Añadir cámara con controles.

Resultado esperado:

* Se ven coches avanzando por una carretera de varios carriles.

---

### Fase 2: lógica básica de tráfico

Objetivo:

* Añadir velocidad individual.
* Añadir distancia de seguridad.
* Frenar si hay coche delante.
* Acelerar si hay espacio.
* Evitar solapamientos.

Resultado esperado:

* Los vehículos no se atraviesan.
* Se generan pequeñas reducciones de velocidad si hay muchos coches.

---

### Fase 3: varios carriles y cambios de carril

Objetivo:

* Permitir que los vehículos cambien de carril.
* Adelantar vehículos lentos.
* Evitar cambios si no hay espacio.

Resultado esperado:

* Los vehículos se redistribuyen por carriles.
* Los camiones pueden generar adelantamientos lentos.

---

### Fase 4: cuello de botella

Objetivo:

* Crear reducción de 3 carriles a 2.
* Forzar incorporación de vehículos.
* Medir cola y velocidad.

Resultado esperado:

* Se forma retención si el flujo de entrada supera la capacidad del tramo reducido.

---

### Fase 5: incidentes

Objetivo:

* Añadir vehículo parado.
* Añadir accidente.
* Añadir carril cortado.
* Añadir evento temporal.

Resultado esperado:

* El tráfico reacciona a obstáculos.
* Se generan ondas de frenada.

---

### Fase 6: efecto badoc

Objetivo:

* Añadir accidente visible en sentido contrario.
* Hacer que algunos conductores reduzcan velocidad por curiosidad.
* Observar si aparece retención sin obstáculo directo.

Resultado esperado:

* En tráfico denso, una reducción ligera de velocidad puede crear congestión.

---

### Fase 7: métricas y análisis

Objetivo:

* Mostrar gráficos o indicadores.
* Calcular velocidad media.
* Calcular cola.
* Calcular tiempo perdido.
* Calcular caudal.

Resultado esperado:

* El usuario puede comparar escenarios.

---

## 16. Requisitos de interfaz

La interfaz debe tener:

### Zona principal

* Visualizador 3D de la carretera.

### Panel lateral

Controles para:

* Iniciar/pausar.
* Reiniciar.
* Añadir eventos.
* Modificar flujo de tráfico.
* Modificar porcentaje de camiones.
* Modificar número de carriles.
* Activar/desactivar badoc.
* Activar/desactivar adelantamiento de camiones.

### Panel inferior o superior

Indicadores en tiempo real:

* Velocidad media.
* Vehículos activos.
* Vehículos detenidos.
* Cola máxima.
* Caudal.
* Tiempo simulado.

---

## 17. Ejemplo de escenario inicial

El simulador debería arrancar con un escenario de prueba:

```js
const scenario = {
  road: {
    length: 5000,
    defaultLanes: 3,
    speedLimit: 120
  },
  traffic: {
    vehiclesPerHour: 2500,
    truckPercentage: 15,
    averageDesiredSpeed: 115,
    averageReactionTime: 1.2
  },
  events: [
    {
      type: "lane_reduction",
      positionStart: 2200,
      positionEnd: 2600,
      fromLanes: 3,
      toLanes: 2
    }
  ]
};
```

Este escenario debe mostrar cómo se comporta el tráfico ante un paso de 3 carriles a 2.

---

## 18. Ejemplo de comportamiento de vehículo

Pseudocódigo:

```js
function updateVehicle(vehicle, deltaTime) {
  const frontVehicle = findVehicleAhead(vehicle);

  if (frontVehicle) {
    const distance = frontVehicle.position - vehicle.position;

    if (distance < vehicle.safeDistance) {
      vehicle.speed -= vehicle.braking * deltaTime;
    } else {
      vehicle.speed += vehicle.acceleration * deltaTime;
    }
  } else {
    vehicle.speed += vehicle.acceleration * deltaTime;
  }

  vehicle.speed = clamp(vehicle.speed, 0, vehicle.desiredSpeed);
  vehicle.position += vehicle.speed * deltaTime;
}
```

Este pseudocódigo es simplificado. La versión real debe convertir correctamente unidades, por ejemplo km/h a m/s.

---

## 19. Unidades

Se recomienda trabajar internamente con:

* Posición en metros.
* Velocidad en metros por segundo.
* Tiempo en segundos.
* Aceleración en metros por segundo al cuadrado.

Para mostrar al usuario:

* Velocidad en km/h.
* Distancia en metros o kilómetros.
* Caudal en vehículos/hora.
* Tiempo en minutos y segundos.

Conversión:

```js
kmh = ms * 3.6;
ms = kmh / 3.6;
```

---

## 20. Requisitos técnicos mínimos

* Debe funcionar en navegador moderno.
* Debe poder ejecutarse localmente.
* Debe usar Three.js para la escena 3D.
* Debe permitir cámara con pan y zoom.
* Debe tener una simulación en tiempo real.
* Debe poder pausar y reiniciar.
* Debe permitir añadir al menos un cuello de botella.
* Debe mostrar vehículos en movimiento.
* Debe calcular al menos velocidad media y número de vehículos detenidos.

---

## 21. Prioridades

### Prioridad alta

* Carretera 3D.
* Vehículos en movimiento.
* Cámara navegable.
* Distancia de seguridad.
* Cuello de botella.
* Vehículo parado.
* Camiones.
* Métricas básicas.

### Prioridad media

* Cambios de carril avanzados.
* Efecto badoc.
* Retenciones fantasma.
* Eventos temporales.
* Mapa de calor.

### Prioridad baja

* Modelos 3D realistas.
* Texturas avanzadas.
* Curvas complejas.
* Intersecciones.
* Datos reales de tráfico.
* Exportación de escenarios.

---

## 22. Criterio de éxito de la primera versión

La primera versión se considerará válida si permite:

1. Abrir una página HTML.
2. Ver una carretera en 3D.
3. Hacer zoom y pan.
4. Ver coches y camiones circulando.
5. Configurar una carretera de 3 carriles que pasa a 2.
6. Observar que los coches frenan y se acumulan antes del estrechamiento.
7. Ver métricas básicas de velocidad media y vehículos detenidos.
8. Reiniciar la simulación y probar de nuevo.

---

## 23. Descripción corta del proyecto

Simulador web 3D de tráfico basado en agentes, desarrollado con HTML, CSS, JavaScript y Three.js. Permite crear una carretera virtual de longitud indefinida, navegar con pan y zoom, añadir alteraciones como reducción de carriles, vehículos parados, camiones, accidentes o efecto badoc, y observar cómo aparecen retenciones, ondas de frenada, cuellos de botella y congestión acumulada.

---

## 24. Descripción técnica corta para el agente

Crear una aplicación web local con Three.js que simule tráfico en una autopista recta. Cada vehículo es un agente con posición, carril, velocidad, aceleración, distancia de seguridad y tipo. La carretera se compone de segmentos configurables con distinto número de carriles. La escena debe permitir pan, zoom y rotación. El usuario debe poder añadir eventos como reducción de carriles, vehículo parado, camiones o accidente visible. El sistema debe actualizar la simulación en tiempo real y mostrar métricas básicas de congestión.
