#!/bin/sh
# Uso: ./shots.sh plan.json carpeta [ancho x alto]
SIZE=${3:-1720x720}
rm -rf "$2"; cp ${ATRIO_CFG:-/home/claude/fakeconfig.json} /home/claude/fakehome/.config/atrio/config.json; mkdir -p /home/claude/fakehome/.local/share/atrio; cp ${ATRIO_PLAY:-/home/claude/fakeplay.json} /home/claude/fakehome/.local/share/atrio/playlog.json; cp /home/claude/fakehome/.local/share/atrio/meta.json /tmp/meta.keep 2>/dev/null; true
env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME ATRIO_HOME=/home/claude/fakehome ATRIO_SHOTS="$2" ATRIO_SHOT_PLAN="$1" ATRIO_SIZE=$SIZE \
  timeout 200 xvfb-run -a -s "-screen 0 3500x1500x24" ./node_modules/electron/dist/electron --no-sandbox . 2>&1 \
  | grep -v "dbus\|Fontconfig\|GPU\|gpu\|viz\|EGL\|egl\|vaapi\|libva\|Gtk\|SharedImage" | grep -v "^undefined" | tail -40
