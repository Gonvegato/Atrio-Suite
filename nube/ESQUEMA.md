# La nube de la suite

Una sola base de datos de Firebase (Realtime Database) y Firebase Authentication con usuario y
contraseña. Atrio en el móvil y Atrio en el PC son dispositivos de la misma cuenta. **Las reglas no cambian**
respecto a las que ya tenías (`reglas.json` es la misma copia que enseña Atrio en el móvil en Ajustes → Cuenta y pareja):
todo lo nuevo cuelga de `/users/<uid>`, que solo puede leer y escribir su dueño (y leer su pareja).

```
/config/webKey                         clave web del proyecto (pública)
/usernames/<usuario>                   -> uid
/users/<uid>/
  name, user, partner                  como siempre
  dev/<dispositivo>                    { name, user, device, updated, data }  datos de tus fichas (cada dispositivo el suyo)
  stamps/<dispositivo>                 hora de su última subida  ← se escucha en tiempo real
  horas/<dispositivo>, horasAt         horas de juego de cada PC (Atrio)
  suite/                               ← NUEVO: todo lo de la suite, escuchado en tiempo real
    live/<dispositivo>                 { app: "atrio"|"ronron", name, os, on, at, game: {key,name,sg,s,cover,hero,logo} }
    lib/<dispositivo>                  { at, name, games: [{k,n,c,sg,f,lp,s,m}] }  biblioteca de cada PC
    cmd/<dispositivo>/<id>             { op, a, t, by }  orden para ese dispositivo → él escribe res: { ok, msg, t, shot? }
    shots/<id>                         { id, dev, pc, w, h, mime, bytes, n, up, done, got: {<disp>: t}, gone, game, name, m, t }
  shotdata/<id>/<n>                    la captura en base64, en trozos de 512 KB (se borra cuando el móvil la tiene)
```

## Tiempo real

Los dos lados usan la API REST de Firebase en *streaming* (`Accept: text/event-stream`): al conectar
llega todo y después cada cambio al instante (`put`/`patch`). Se escuchan dos sitios:
`/users/<uid>/suite` y `/users/<uid>/stamps`. Cuando un dispositivo sube sus datos cambia su `stamp`,
y los demás los mezclan en ese momento (antes se miraba cada 20–30 s).

## Órdenes del móvil al PC

| `op`     | `a`                         | Qué hace en Atrio                                              |
|----------|-----------------------------|----------------------------------------------------------------|
| `shot`   | —                           | Captura la pantalla a su resolución, la guarda y la sube        |
| `launch` | `{ key }`                   | Lanza ese juego de la biblioteca                                |
| `page`   | `{ key }`                   | Abre la página del juego en la pantalla                         |
| `focus`  | —                           | Trae Atrio al frente                                           |
| `toast`  | `{ text }`                  | Enseña un aviso en la pantalla                                  |
| `power`  | `{ action: suspender\|reiniciar\|apagar }` | Energía del equipo (el móvil pide confirmación) |
| `rescan` | —                           | Vuelve a leer las bibliotecas                                   |
| `ping`   | —                           | Responde con la versión y el nombre del equipo                 |

Las órdenes de más de 10 minutos se ignoran (por si el PC estaba apagado) y se borran a los 5 minutos
de responderlas. En Atrio → Ajustes → Suite con el móvil se puede prohibir cada tipo.

## Capturas

PNG sin pérdida (o JPG si lo eliges) a la resolución real de la pantalla. Se suben en trozos de 512 KB
(múltiplo de 4 caracteres, así cada trozo se decodifica por separado). El móvil las baja, las guarda en
`Imágenes/Atrio/<juego>` y en la app, marca `got/<su dispositivo>` y Atrio borra los trozos. En el PC se
quedan en `Imágenes/Atrio/<juego>`. Con el plan gratuito de Firebase (1 GB guardado, 10 GB/mes de descarga)
caben unas 500 capturas 4K PNG al mes; como los trozos se borran al llegar, lo guardado no crece.

## Datos nuevos en las fichas en curso

- `memos`: apuntes rápidos `{ t, x, sh?, del?, u? }` (borrado = `del: 1`, para que no reviva).
- `segs`: partes jugadas `{ id, s, e, min, src: atrio|timer|manual, pc?, name? }`.
- En cada apunte con nota (`entries`): `seg` (la parte que valora) y `part` (el capítulo).

Al mezclar dos versiones de una ficha, `memos` y `segs` **se suman** (no gana una versión entera),
porque el móvil y el PC los añaden a la vez.
