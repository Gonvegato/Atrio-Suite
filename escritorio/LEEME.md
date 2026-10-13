# Atrio 0.10

Launcher minimalista para juegos en Linux: Steam, Heroic (Epic, GOG, Amazon), Lutris,
emuladores y juegos propios, con arte de SteamGridDB.

- Probar sin instalar: `./probar.sh`
- Crear el AppImage: `./construir.sh` (queda en `dist/`)

Requiere `nodejs` y `npm` (`sudo pacman -S nodejs npm`).

Configuración: `~/.config/atrio/config.json`. Arte descargado: `~/.local/share/atrio/art`.
Horas de juego: `~/.local/share/atrio/playlog.json`.

## Windows

El instalador se construye solo en GitHub (rama `atrio`, acción «Atrio para Windows»):
descarga «Atrio-instalador-Windows» de la última ejecución y ábrelo.
En Windows lee Steam, Heroic, emuladores y juegos propios (Lutris no existe allí).
Datos: `%LOCALAPPDATA%\Atrio-datos`.

Con la cuenta de Ronrón iniciada, las horas de todos tus equipos se juntan en el calendario.
