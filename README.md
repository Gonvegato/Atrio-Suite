# Ronrón · Atrio — la suite

Dos apps que ahora son una sola cosa:

- **Ronrón** (`movil/`, Android): tus juegos, libros, películas, series y categorías propias; valoraciones,
  apuntes, calendario, estadísticas, «Siguiente», modo pareja, copias en Drive… y ahora el **mando del PC**.
- **Atrio** (`escritorio/`, Linux y Windows): el launcher de Steam, Heroic, Lutris, emuladores y juegos propios,
  con arte de SteamGridDB, mando, horas de juego y tu cuenta de Ronrón… y ahora **conectado al móvil en directo**.

Comparten tu cuenta de Ronrón (Firebase) y se hablan en **tiempo real** (streaming de Firebase, sin esperas
de 20–30 s como antes).

## Lo nuevo de la suite

**En directo**
1. El móvil ve al momento a qué juegas en el PC: fondo, logo, cronómetro de la partida y horas totales.
2. Indicador en Atrio cuando el móvil está conectado (punto rojo que late) y panel con tus dispositivos.
3. Si tienes varios PC con Atrio, eliges a cuál mandar las órdenes.
4. Los cambios entre móvil y PC se mezclan al instante (antes cada 20–30 s).

**Capturas desde el móvil**
5. Botón **Captura** en el móvil → Atrio captura la pantalla a su **resolución real** (PNG sin pérdida, o JPG si lo prefieres).
6. Llega al móvil tal cual, byte a byte, y se guarda en la app y en `Imágenes/Ronrón/<juego>`.
7. En el PC se guarda en `Imágenes/Atrio/<juego>`; el PC hace un destello y avisa de que la ha enviado.
8. Visor con zoom (pellizco y doble toque), compartir, abrir en la galería y borrar.
9. Galería de capturas en el móvil, por juego en cada ficha, y en Atrio (página del juego y panel de la suite).
10. Capturar también desde el propio Atrio (panel de la suite).
11. En Linux usa la herramienta del escritorio (KDE: Spectacle, sin avisos; Sway/Hyprland: grim; GNOME:
    gnome-screenshot; X11: Chromium o ImageMagick); en Windows, la captura de Chromium a tamaño físico.

**Apuntes**
12. **Apunte rápido** desde la tarjeta en directo, la ficha o Atrio: texto suelto mientras juegas.
13. Apunte con la **captura de ese momento** incluida (un toque).
14. Desde el visor de una captura: «Apunte» con esa captura.
15. Los apuntes rápidos se ven en el móvil y en Atrio (ficha de Ronrón) y se editan o borran en ambos.
16. Si móvil y PC añaden apuntes a la vez, se suman (no se pisan).

**Valorar partes**
17. **Automático:** al cerrar un juego que tienes en «Jugando», Atrio guarda la partida como **parte jugada**
    (inicio, fin, minutos, PC) y suma sus minutos.
18. Aparece al momento en el móvil en **Por valorar**; con la app cerrada, una notificación te lo recuerda.
19. Valorar una parte = un apunte con nota (los mismos anillos de siempre) ligado a esa partida.
20. **Desde el temporizador:** al terminar una sesión del móvil, se guarda como parte y te ofrece valorarla.
21. **Manual:** «Añadir parte» en cualquier ficha en curso (duración y día), y se valora al momento.
22. **Capítulos:** al marcar un capítulo/acto/episodio como completado, te ofrece valorarlo.
23. En Atrio, la ficha de Ronrón lista las partidas sin valorar (en rojo) y se valoran con el mando.
24. En Atrio, los juegos en curso llevan un contador rojo con las partidas pendientes.
25. Puedes descartar una parte que no quieras valorar.

**Mando del PC** (pantalla «Mando» del móvil)
26. Biblioteca del PC en el móvil (portadas, favoritos, horas) con buscador: **toca un juego y se abre en el PC**.
27. «Seguir jugando»: los últimos juegos del PC a un toque.
28. Traer Atrio al frente, volver a leer las bibliotecas.
29. **Suspender, reiniciar o apagar** el PC (con confirmación).
30. Mandar un **mensaje** que sale como aviso en la pantalla del PC.
31. Lista de dispositivos de la cuenta y cuándo se vieron por última vez.
32. Si el juego que se juega en el PC no está en Ronrón, al apuntar se añade a «Jugando» (o vuelve, si lo rejuegas).

**Control y privacidad** (Atrio → Ajustes → Suite con el móvil)
33. Permitir o no capturas, lanzar juegos y energía desde el móvil.
34. Formato (PNG/JPG), qué pantalla capturar y si se envían al móvil o solo se guardan en el PC.
35. Partes automáticas sí/no y duración mínima (5/15/30 min).
36. Todo va por tu cuenta: las reglas de Firebase **no cambian** (ver `nube/`).

Y **todo lo que ya había** sigue igual en las dos apps (layouts, temas, mando, emuladores, SteamGridDB,
horas, calendario, pareja, cartas, importaciones, Drive, exportar fichas…).

## Estructura

```
movil/         Ronrón (Android, Kotlin + Compose). Mismo applicationId y misma firma: se instala encima sin perder datos
escritorio/    Atrio (Electron). Mismas carpetas de datos: se actualiza sin perder nada
nube/          reglas de Firebase y esquema de datos de la suite (ESQUEMA.md)
herramientas/  Firebase de mentira (con streaming), pruebas de la suite y prueba en emulador
```

## Construir

- **APK**: GitHub → Actions → «Ronrón (móvil)» → artefacto `ronron-apk`. En local: `cd movil && gradle assembleRelease`.
- **AppImage**: Actions → «Atrio (Linux)» → `Atrio-AppImage`. En local: `cd escritorio && ./construir.sh`.
- **Windows**: Actions → «Atrio (Windows)» → `Atrio-instalador-Windows`.

## Pruebas

- `node herramientas/prueba-suite.js`: Firebase de mentira + Atrio de verdad (Xvfb) + un móvil simulado:
  directo, órdenes, captura a resolución real bajada byte a byte, lanzar juego, parte jugada y mezcla al instante.
- `cd movil && gradle testDebugUnitTest`: streaming y mezcla del móvil contra el Firebase de mentira.
- `node herramientas/capturas-atrio.js`: capturas de la interfaz de Atrio con la suite conectada.
- Actions → «Prueba en emulador»: Ronrón en un emulador Android con Atrio de verdad al lado, de principio a fin.

## Capturas

Móvil (emulador Android en GitHub Actions, con Atrio de verdad al lado):
[PC conectado](docs/capturas/25_suite_conectado.png) ·
[captura recibida a 1920×1080](docs/capturas/26_captura.png) ·
[biblioteca del PC](docs/capturas/28_biblioteca_pc.png) ·
[en directo](docs/capturas/29_en_directo.png) ·
[apunte rápido](docs/capturas/30_apunte.png) ·
[por valorar](docs/capturas/31_por_valorar.png) ·
[valorar la partida](docs/capturas/32_valorar_partida.png)

Atrio: [panel de la suite](docs/capturas/02-panel-suite.png) ·
[ficha con partidas por valorar](docs/capturas/06-ficha-ronron.png) ·
[ajustes de la suite](docs/capturas/07-ajustes-suite.png)
