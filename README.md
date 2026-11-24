# Sideways GP

Juego de carreras arcade en 3D (low-poly neón) que funciona en el navegador: derrapes con turbo, cajas de poder, rivales que chocan, 11 modos, 9 circuitos abiertos, **campaña de 50 circuitos largos**, 34 coches de Common a Legendary, **tiradas para ganar coches**, **taller de pintura que cambia cada 12 horas**, **misiones**, **varias partidas guardadas**, **resistencia con pit lane**, **clasificación global** y **multijugador online** para hasta 8 personas.

Es un sitio estático: no hay que compilar nada.

## Publicar en Vercel

**Opción A: desde GitHub (recomendada, se actualiza sola con cada push)**

1. Sube esta carpeta a un repositorio nuevo de GitHub.
2. En vercel.com, pulsa **Add New → Project** e importa el repositorio.
3. En *Framework Preset* elige **Other**. Deja vacíos *Build Command* y *Output Directory*.
4. Pulsa **Deploy**.

**Opción B: con la línea de comandos de Vercel**

```bash
npm i -g vercel
```

```bash
vercel --prod
```

Ejecútalo dentro de esta carpeta y acepta las opciones por defecto.

## Partidas, coches, pintura y misiones

- **Partidas guardadas (careers).** Al abrir el juego eliges con qué partida seguir (**Continue**), cargas otra (**Load**) o empiezas una nueva con otro nombre. Caben 6. Cada una guarda sola sus coches, créditos, pinturas, misiones y avance de campaña.
- **Cinco coches para empezar.** Cada partida nueva elige 5 coches **Common** entre 9.
- **Car shop: tiradas (spins).** Los coches tienen rareza: Common, Rare, Epic y Legendary. En el **Car shop** gastas una tirada y te toca un coche al azar de cualquier rareza, menos los coches premio: Common 35%, Rare 35%, Epic 22%, Legendary 8%. Como mucho cada 10 tiradas sale un Epic o Legendary seguro. Solo te toca un coche repetido cuando ya tienes todos los de esa rareza, y entonces te devuelve créditos (1.000, 2.500, 6.000 o 15.000 CR). Las tiradas se ganan con misiones (1 a 5 según la dificultad, y 1 por completar las tres metas del día) o se compran: 1 por 6.000 CR o 5 por 27.000 CR.
- **Coches premio.** Cuatro coches no se venden: se ganan en misiones (Apex Comet, Ironclad Titan) y en la campaña (Night Specter en la etapa 25, Sideways One en la 50).
- **Paint shop.** Vende 4 skins y 6 pinturas y cambia cada 12 horas, con la hora real, aunque el juego esté cerrado. Lo que compras vale para todos tus coches.
- **Misiones.** La pantalla **Missions** tiene tres metas diarias (se renuevan cada 24 horas; completar las tres da un extra) y 19 misiones en cuatro niveles: Easy, Medium, Hard y Extreme. Cuanto más difíciles, más créditos y tiradas, y algunas dan un coche premio.
- **Barra de arriba.** En todas las pantallas del menú: tu **nivel de piloto** (LV), cuántos coches tienes, tus tiradas, tus créditos y el botón **Shop**.
- **Nivel de piloto.** Subes de nivel corriendo, ganando créditos y banderas de la campaña. Cada nivel nuevo te da **1 tirada** y créditos (500 × el nivel).
- **Valoración del coche (Rating).** Cada coche tiene un número de 200 a 1000 según lo rápido que es. En la pantalla del coche ves también sus números: velocidad punta en km/h, aceleración, manejo, derrape y peso.
- **Créditos (CR).** Cada carrera paga créditos: más cuanto mejor quedes y cuanto más alta la dificultad.
- **Dificultad y rivales.** En la carrera rápida eliges de 1 a 11 rivales y cinco niveles: Rookie, Easy, Normal, Hard y Legend. La dificultad está justo encima de **Start race**, en la pantalla del coche. La campaña tiene su propia dificultad, en la pantalla de la campaña, que cambia el ritmo de los diez rivales y los créditos de cada bandera.
- **Volver a tus partidas.** El botón con tu nombre, arriba en todas las pantallas del menú (o **Switch career** en **Career**), abre la lista de partidas. **Back** la cierra sin cambiar nada.
- **Estadísticas y Reset career.** La pantalla **Career** muestra tus números. Reset career borra la partida actual (hay que pulsarlo dos veces) y vuelves a elegir 5 coches.

## Mundo abierto

Al elegir tu partida apareces en la isla, ya no en un menú. Manejas libre por carreteras, ciudad, costa, bosque, montañas nevadas, el valle de cerezos con el castillo y el desierto.

- **Carreras en la carretera:** cada salida tiene una columna de luz roja. Llegas, presionas **E** y corres contra 7 rivales: con vueltas en los circuitos o de punta a punta en los sprints. Al terminar ves los resultados y los créditos.
- **Sideways Arena** (columna celeste, en el festival): los modos clásicos con power-ups, Endurance, Hot Potato, etc. **The Ten** (columna morada): la campaña de 50 etapas. Al terminar vuelves a la isla.
- **Desafíos:** radares de velocidad, zonas de derrape y saltos, con 1 a 3 estrellas. La primera vez que ganas cada estrella te pagan créditos y se guarda tu récord.
- **Tu garaje** (columna amarilla): entras con **E** para afinar el carro y vuelves a salir a la isla.
- **Tráfico** en las carreteras: si chocas un carro, sale volando y luego vuelve a su carril.
- **Teclas:** **M** mapa (toca un punto para trazar una ruta GPS), **R** volver a la carretera, **C** cámara, **Esc** pausa.


Los menús están dentro de un garaje 3D: piso de concreto pulido que refleja el carro, paredes de lámina, repisas con cajas, cajas de equipo, lámparas de trabajo y luces en el techo que se reflejan en la pintura. Al cambiar de pantalla la cámara se mueve sola alrededor del carro; puedes **arrastrar** para mirarlo desde cualquier lado y **hacer zoom** con la rueda del ratón o pellizcando la pantalla.

El **taller** se abre con la tarjeta **Garage** de la pantalla de inicio o con el botón **Tune** de la pantalla del carro. Tiene ocho secciones, y la cámara se va sola a la parte del carro que estás cambiando:

- **Paint:** color de la carrocería, color de los detalles y skin (los que compraste en el Paint shop).
- **Wheels:** 6 diseños de rines, color de rines, color de los calipers de freno y altura (de fábrica, rebajado o muy rebajado).
- **Body kit:** splitter delantero, faldones laterales, difusor trasero, cofre (rejillas, toma de aire o fibra de carbono) y techo (aleta o toma de aire).
- **Spoiler:** sin alerón, ducktail, alerón GT o alerón de carreras.
- **Exhaust:** puntas de escape (cuatro, centrales o de titanio).
- **Lights:** neón debajo del carro (7 colores), polarizado de vidrios y número de carrera en las puertas.
- **Performance:** motor, turbo, caja de cambios, suspensión, llantas y reducción de peso, con 5 niveles cada uno. Suben los números del carro y su valoración (Rating), y el carro corre así en las carreras.
- **Service:** cada carrera gasta un poco el carro (más si chocas o te das vueltas). Por debajo de 70% pierde algo de velocidad, hasta 5% en 0%. **Repair** lo deja al 100%. **Wash** lo limpia (el polvo es solo visual y se acumula más rápido en nieve, arena y ceniza).

Las piezas se **prueban antes de comprarlas**: tocas una y la ves puesta en el carro; si te gusta, **Buy and fit**; si no, **Undo**. Cada pieza se compra una vez para ese carro y luego se puede quitar y poner gratis. El precio depende de la rareza del carro. Los rivales también salen con piezas al azar, y en el online los demás ven las tuyas.

## Cajas de poder

Nitro, misil, mancha de aceite, escudo, onda de choque, ariete y la **bomba al líder**: vuela alta por encima de todos, sigue al coche que va primero y explota sobre él (y sobre quien esté a menos de 14 m). Solo la consiguen los que van por detrás; un escudo la para. Si la lanzas yendo primero, va a por el segundo. El misil, si vas primero, se da la vuelta y va a por el coche de detrás.

## Sonido

El motor se genera en el momento a partir de cómo suena uno de verdad: cada explosión de cilindro hace sonar el escape, con seis marchas, cambios, petardeo al levantar el pie y silbido del turbo. Cada coche lleva su tipo de motor real (4 cilindros, rotativo, 6, V8, V10, V12 o W16), y los eléctricos (Rimac y Lotus) suenan a motor eléctrico.

## Campaña

La campaña es un camino de etapas unidas: las que ya superaste se marcan en amarillo. Cada etapa te dice la **valoración recomendada** y la de tu coche (en verde si llegas, en rojo si no). Cincuenta etapas en circuitos largos (de 4,6 a 6,9 km) que **solo existen en la campaña**. Siempre corres contra los mismos diez rivales: Vega, Marlow, Tanaka, Duarte, Okoro, Lindqvist, Reyes, Novak, Brandt y Sato, cada vez un poco más rápidos. Terminar entre los tres primeros abre la etapa siguiente: 1.º gana tres banderas, 2.º dos y 3.º una. Cada bandera nueva paga créditos.

## Modos

Once modos. Los cuatro nuevos:

- **Endurance 50.** Cincuenta vueltas (también hay 10 y 25) en una **variante con pit lane** de cada circuito: justo después de la meta hay una entrada, un muro de boxes, garajes y una salida. Los coches se desgastan con la distancia, los derrapes y los golpes: pierden velocidad y al final **se rompen** y solo pueden arrastrarse. Entra al pit lane, párate en un box azul y cambia a otro de **tus** coches. Los coches aparcados se reparan mientras corres. Los rivales también entran a boxes cuando lo necesitan.
- **Hot Potato.** Un coche lleva una bomba con cuenta atrás. Tocar a un rival se la pasa. Quien la tenga cuando llegue a cero queda eliminado. Gana el último.
- **Sudden Death.** Un golpe y fuera: cualquier trompo (misil, aceite, ariete, choque fuerte) te elimina.
- **Checkpoint Rush.** Tú solo contra el reloj. Cada punto de control suma tiempo, cada vez un poco menos. A ver hasta dónde llegas.

Los otros siete: Grand Prix, Grand Tour, Last Car Standing, Drift Kings, Power Box Mayhem, Turbo Rush y Time Trial.

## Circuitos

Nueve circuitos. Cinco tienen relieve de verdad (cuestas y peraltes), y los dos últimos son los más largos:

- **Monza Sopraelevata.** Basado en el trazado del histórico óvalo de alta velocidad de Monza: dos rectas largas unidas por dos curvas peraltadas. Aquí el peralte está exagerado y se hace más empinado hacia arriba, hasta que casi conduces por una pared. Si vas despacio por la parte alta, el coche resbala hacia abajo.
- **Volcano Ridge.** Subidas y bajadas fuertes alrededor de un volcán, con horquillas peraltadas.
- **Skyline Expressway.** Autopista elevada de noche, con rampas largas entre rascacielos.
- **Indiana Speedway (4,0 km).** Basado en el óvalo de Indianápolis: un rectángulo con cuatro curvas peraltadas iguales, dos rectas largas y dos cortas. Se va a fondo casi toda la vuelta.
- **Monaco Streets (3,7 km).** Basado en el circuito urbano de Mónaco, curva por curva: Sainte Devote, la subida al Casino, Mirabeau, la horquilla, Portier, el túnel, la chicane del puerto, Tabac, la piscina y La Rascasse. Con aceras, público que anima, tiendas con toldos, palmeras, avenidas y un puerto con muelles, yates y un crucero.

## Clasificación global

La pantalla **Ranks** tiene dos tablas: **Top drivers** (victorias, podios, carreras, créditos ganados) y **Lap records** (mejor vuelta por circuito). Tu fila sale resaltada.

La clasificación vive en el mismo servidor de Cloudflare que el modo online (carpeta `relay/`). Sin ese servidor, la pantalla solo muestra tus propios récords.

- Si **todavía no has publicado** el servidor, sigue los pasos de "Conectar desde cualquier red". Al publicarlo quedan activos el online y la clasificación.
- Si **ya lo publicaste** antes de esta versión, vuelve a ejecutar `npx wrangler deploy` dentro de `relay/` para añadir la clasificación.

Las puntuaciones las envía el juego de cada jugador. El servidor comprueba que sean posibles (por ejemplo, no más victorias que carreras, ni vueltas imposibles) y que nadie pueda sobrescribir la entrada de otro, pero alguien con conocimientos podría enviar números inventados. Es una clasificación para picarse entre amigos, no un campeonato oficial. Las vueltas de Turbo Rush no cuentan como récord.

## Multijugador online

En el menú pulsa **Race friends online** (o la pestaña **Online**).

1. Una persona pulsa **Create room** y recibe un código de 4 letras, por ejemplo `K7QM`.
2. Le pasa el código a sus amigos, o el enlace de **Copy invite link**.
3. Los demás escriben el código en **Join a race**, o abren el enlace.
4. Cada uno elige su coche con **Change car**.
5. Quien creó la sala elige modo, circuito y vueltas, y pulsa **Start race**.

Caben hasta 8 jugadores. Los huecos libres se rellenan con rivales de la IA, si quieres.
Modos online: Grand Prix, Last Car Standing, Power Box Mayhem y Turbo Rush.

**Cómo funciona.** Los navegadores se conectan directamente entre sí (WebRTC, con la librería PeerJS). El servidor gratuito de PeerJS (`0.peerjs.com`) solo los presenta; después los datos van de navegador a navegador. El navegador de quien creó la sala hace de árbitro: mueve a la IA, reparte las cajas, lleva los misiles, el aceite y las eliminaciones, y reenvía cada coche a todos. Cada jugador conduce su propio coche en su navegador, así que el volante responde al instante. No necesitas ningún servidor propio: basta con Vercel.

**Cosas a tener en cuenta**

- Quien crea la sala debe dejar la pestaña abierta mientras juegan. Si la cierra, la sala se cierra para todos.
- Sin el servidor de retransmisión (siguiente apartado), algunas redes de colegios, oficinas o datos móviles bloquean la conexión directa y esos jugadores no podrán entrar.
- Cada navegador ve las posiciones con unos milisegundos de diferencia. Los choques entre dos jugadores los resuelve cada uno en su lado, así que de vez en cuando un golpe puede sentirse un poco distinto en cada pantalla.
- El modo online solo funciona en la versión publicada (Vercel o `npm run dev`). No funciona abriendo `index.html` con doble clic.

## Conectar desde cualquier red (colegio, oficina, datos móviles)

Para que se pueda jugar desde redes que bloquean la conexión directa, el proyecto incluye un pequeño **servidor de retransmisión** en la carpeta `relay/`. Funciona en Cloudflare y es gratis.

Usa una conexión web segura normal (WebSocket por el puerto 443, el mismo que cualquier página `https`). Por eso pasa por los mismos sitios por los que pasa una web cualquiera.

El juego elige solo:
1. Primero intenta la **conexión directa** entre navegadores, que es la más rápida.
2. Si en 3 segundos no lo consigue, entra por el **servidor**. El jugador no tiene que hacer nada.

En la sala, junto a cada jugador pone **direct** o **via server** para que sepas cómo está conectado.

En la pantalla **Online** también hay un selector **Connection**:
- **Auto (recomendado):** prueba la conexión directa y, si no funciona, usa el servidor.
- **Server only:** entra directamente por el servidor, sin esperar. Úsalo en una red donde sabes que la conexión directa nunca funciona; así conecta en 1 o 2 segundos en lugar de unos 4.

Esta opción solo se activa cuando el servidor ya está publicado y su dirección está en `config.js`.

### Publicar el servidor (una sola vez)

Necesitas una cuenta gratis en [cloudflare.com](https://dash.cloudflare.com/sign-up) y Node.js instalado.

1. Abre una terminal en la carpeta `relay` del proyecto:

```bash
cd relay
```

2. Instala la herramienta de Cloudflare:

```bash
npm install
```

3. Inicia sesión; se abrirá el navegador para dar permiso:

```bash
npx wrangler login
```

4. Publica el servidor:

```bash
npx wrangler deploy
```

   La primera vez te pedirá elegir un subdominio `workers.dev`; acepta el que te propone o escribe uno. Al terminar te mostrará una dirección parecida a `https://sideways-gp-relay.TU-NOMBRE.workers.dev`.

5. Comprueba que funciona: abre esa dirección en el navegador. Debe decir `Sideways GP relay is running.`

6. Abre `config.js` (en la carpeta principal del proyecto) y pega la dirección:

```js
window.SGP_RELAY = 'https://sideways-gp-relay.TU-NOMBRE.workers.dev';
```

7. Sube el cambio a GitHub (o vuelve a ejecutar `vercel --prod`) para que Vercel publique la nueva versión.

Listo. A partir de ahí, si la conexión directa no funciona, el juego usa el servidor sin que nadie tenga que hacer nada.

### Si aun así no conecta

- **Prueba la dirección del servidor.** Si en la red del colegio la página del juego carga pero la dirección `...workers.dev` no abre, ese filtro bloquea los dominios `workers.dev`. Solución: en Cloudflare, en *Workers & Pages → sideways-gp-relay → Settings → Domains & Routes*, añade un dominio tuyo (por ejemplo `relay.tudominio.com`). Pon esa dirección en `config.js`, y añádela también en `vercel.json`, dentro de `connect-src`, como `wss://relay.tudominio.com`.
- **Si la página del juego tampoco carga en esa red**, el filtro bloquea el propio juego y no hay forma técnica de saltárselo desde el juego.
- **Límite del plan gratis.** El plan gratuito de Cloudflare tiene un límite diario de uso. Solo se gasta cuando alguien juega a través del servidor, porque las conexiones directas no pasan por él. Puedes ver el consumo en el panel de Cloudflare, en *Workers & Pages*.
- **Opcional: solo tu juego.** Para que solo tu juego pueda usar el servidor, quita los `#` de las líneas `[vars]` y `ALLOWED_ORIGINS` en `relay/wrangler.toml`, pon ahí la dirección de tu juego y vuelve a ejecutar `npx wrangler deploy`.

## Probar en tu ordenador

```bash
npm run dev
```

Luego abre http://localhost:3000.

## Qué incluye

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El juego completo |
| `vendor/three-r187.min.js` | Motor 3D (three.js r187, licencia MIT, con el cargador de modelos glTF y el descompresor meshopt) incluido localmente, sin depender de un CDN |
| `env/` | Fotos de cielo de 360° (CC0, Poly Haven) para los reflejos en las carreras |
| `models/` | Modelos 3D opcionales de los carros (ver `models/README.md`) |
| `vendor/peerjs-1.5.5.min.js` | Conexión entre jugadores (PeerJS 1.5.5, licencia MIT) |
| `config.js` | Dirección del servidor de retransmisión |
| `relay/` | Servidor para Cloudflare: retransmisión del online y clasificación global (no se sube a Vercel) |
| `vercel.json` | Caché larga para los archivos que no cambian y cabeceras de seguridad |
| `sw.js` | Permite jugar sin conexión después de la primera visita |
| `manifest.webmanifest`, `icons/` | Se puede instalar como app en el móvil o el escritorio |
| `og.jpg` | Imagen que aparece al compartir el enlace |

## Al publicar una versión nueva

Cambia `VERSION` en `sw.js` (por ejemplo `sgp-v15`) para que los jugadores que lo tengan guardado reciban los archivos nuevos.

## Controles

| Tecla | Acción |
|---|---|
| W A S D o flechas | Conducir |
| Espacio (mantener) | Derrapar |
| Shift o E | Usar poder |
| R | Volver a la pista |
| C | Cambiar cámara |
| P o Esc | Pausa |
| M | Sonido |

En el móvil aparecen botones en pantalla y el coche acelera solo.
