# Specter

Diagnóstico pasivo del sistema. Specter recopila telemetría de hardware y procesos y la analiza con un modelo de lenguaje para explicar el estado del equipo y sugerir recomendaciones, sin modificar el sistema.

El monorepo se divide en dos aplicaciones:

| Carpeta | Descripción | Stack |
| --- | --- | --- |
| `api/` | Backend de telemetría y diagnóstico | Python · FastAPI · psutil · OpenRouter |
| `web/` | Panel de control (interfaz Vercel minimalista) | Next.js 16 · React 19 · Tailwind CSS 4 |

## Arquitectura

```
api/
├── main.py              # Aplicación FastAPI, CORS y rutas
└── core/
    ├── collector.py     # Lectura de CPU, RAM, disco, temperatura y procesos
    ├── engine.py        # Diagnóstico y chat pasivo vía OpenRouter
    ├── sessions.py      # Capturas y reportes efímeros para el chat
    └── schema.py        # Modelos Pydantic de entrada y salida

web/
├── app/                 # App Router (layout, página, estilos globales)
├── components/          # Dashboard, métricas, tablas y panel de diagnóstico
└── lib/                 # Cliente de API, tipos y utilidades
```

## Requisitos

- Python 3.10+
- Node.js 20+ y pnpm 11+
- Una clave de API de [OpenRouter](https://openrouter.ai/keys) para el diagnóstico

## Puesta en marcha

### 1. Backend

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edita `api/.env` y añade tu clave:

```env
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=minimax/minimax-m3.1-flash:free
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Arranca el servidor:

```bash
uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000
- Documentación interactiva: http://localhost:8000/docs

### 2. Frontend

```bash
cd web
pnpm install
cp .env.example .env.local
pnpm dev
```

Abre http://localhost:3000. Si el backend usa otra URL, cámbiala en `web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Producción

```bash
cd web
pnpm build
pnpm start
```

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado de la API |
| `GET` | `/api/telemetry` | Snapshot de CPU, RAM, disco, temperatura y top procesos |
| `POST` | `/api/diagnose` | Analiza la telemetría y devuelve un diagnóstico con su captura e identificador |
| `POST` | `/api/chat` | Responde preguntas con el contexto de un diagnóstico |

Ejemplo de diagnóstico:

```json
{
  "summary": "El equipo está estable...",
  "alert_level": "HEALTHY",
  "probable_causes": ["..."],
  "recommendations": ["..."]
}
```

`alert_level` puede ser `HEALTHY`, `WARNING` o `CRITICAL`.

## Interfaz

El panel de `web/` incluye:

- Estado de conexión de la API y actualización automática cada 10 segundos.
- Tarjetas de CPU, memoria, disco y temperatura con indicadores de presión.
- Top 5 de procesos por CPU y por memoria.
- Diagnóstico bajo demanda con nivel de alerta, evidencia, causas probables, recomendaciones y limitaciones.
- Chat de seguimiento con preguntas sugeridas y contexto de la captura original.
- Tema claro/oscuro según la preferencia del sistema y diseño responsive.

## Variables de entorno

### `api/.env`

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Obligatoria para `/api/diagnose` y `/api/chat` |
| `OPENROUTER_MODEL` | `minimax/minimax-m3.1-flash:free` | Modelo usado por el motor |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Orígenes permitidos, separados por comas |

### `web/.env.local`

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL base del backend |

## Scripts del frontend

| Comando | Descripción |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo en el puerto 3000 |
| `pnpm build` | Build de producción |
| `pnpm start` | Sirve el build de producción |
| `pnpm lint` | Ejecuta ESLint |

## Seguridad

- Las claves se leen únicamente de variables de entorno; `.env` y `.env.local` están ignorados por git.
- No subas claves al repositorio. Si una clave estuvo expuesta en el código o en un commit, rótala en OpenRouter antes de usarla de nuevo.
- El diagnóstico es pasivo: solo lee telemetría y no aplica cambios al sistema.

## Solución de problemas

- **«No se pudo conectar con la API»**: comprueba que el backend esté corriendo en el puerto 8000 y que `NEXT_PUBLIC_API_URL` apunte a esa URL.
- **Error de CORS**: añade el origen del frontend a `CORS_ORIGINS` y reinicia el backend.
- **«OPENROUTER_API_KEY no configurada»**: crea `api/.env`, define la clave y reinicia uvicorn.
- **Puerto ocupado**: identifica el proceso con `ss -ltnp | grep -E ':3000|:8000'` y deténlo, o arranca en otro puerto con `--port`.

## Chat de seguimiento del diagnóstico

El **Asistente Specter** está visible desde que abres el panel. Pulsa **Diagnosticar equipo**
(o **Diagnosticar mi equipo**) para preparar su contexto y comenzar a conversar.
Puedes usar las preguntas sugeridas o describir síntomas: desde cuándo hay lentitud,
qué aplicaciones estaban abiertas o si el problema aparece con una carga concreta.
Enter envía la pregunta y Shift + Enter inserta una nueva línea. Si falla la consulta,
la pregunta se conserva para reintentar.

El chat recibe el reporte y la **misma captura de telemetría que lo originó**, con fecha
visible. Las actualizaciones del panel en vivo no sustituyen ese contexto. **Nuevo diagnóstico** o **Repetir
análisis** generan otra captura y comienzan una nueva conversación. Cada solicitud incluye
hasta los últimos 10 intercambios completos, recortados por el límite de longitud.

El asistente relaciona mediciones con posibles causas y explica conceptos técnicos en
español. Sus hipótesis pueden ser incorrectas y una captura puntual no demuestra una
falla persistente. No dispone de herramientas para ejecutar comandos, cerrar procesos,
borrar archivos, instalar programas ni cambiar configuraciones. Solo sugiere observaciones
y comprobaciones manuales de solo lectura.

### Alcance de las mediciones

- Se observa el equipo donde corre la API; un navegador remoto no entrega su propio hardware.
- CPU, RAM, ocupación del disco del sistema y los cinco procesos con más CPU y RAM.
- Temperatura de CPU cuando el sistema expone un sensor compatible. Una lectura ausente
  se muestra como no disponible y no bloquea el resto de la telemetría.
- La ocupación del disco no indica salud física. Esta versión no recoge S.M.A.R.T., desgaste,
  registros de eventos ni logs del sistema. Puedes aportar un mensaje de error en el chat,
  evitando incluir información sensible.
- El reporte incluye `evidence` y `limitations`, además de los campos existentes. La interfaz
  los presenta en **Evidencia y alcance del diagnóstico**.

### Contrato de la API del chat

`POST /api/diagnose` conserva los campos previos y agrega `diagnostic_id`, `generated_at`,
`snapshot`, `evidence` y `limitations`. La captura se conserva temporalmente en el servidor
para no aceptar telemetría alterada por el navegador.

`POST /api/chat` recibe:

```json
{
  "diagnostic_id": "UUID devuelto por /api/diagnose",
  "messages": [
    { "role": "user", "content": "¿Qué podría explicar la lentitud?" }
  ]
}
```

Responde con `diagnostic_id` y `message` (texto). El historial debe alternar `user` y
`assistant`, comenzar y terminar en `user`, y no puede incluir roles `system` ni contexto
adicional. Se permiten hasta 21 mensajes, 4000 caracteres por mensaje y 32000 caracteres
en total. El campo de la interfaz permite preguntas de hasta 2000 caracteres.

El contexto dura una hora y se conserva un máximo de 100 diagnósticos en memoria. Se
pierde al reiniciar el backend y puede salir de la caché al alcanzar el máximo. Un contexto
no disponible devuelve **410** y requiere repetir el diagnóstico. Esta implementación
local requiere **un único worker de Uvicorn**; varios workers necesitan un almacén compartido.

Otras respuestas: **422** para entradas inválidas, **429** para límites del proveedor,
**502** para errores o respuestas inválidas del modelo, **503** si falta la clave y **504**
si el proveedor excede el tiempo de espera. No se devuelven cuerpos internos del proveedor.

### Privacidad y ejecución local

La telemetría se obtiene sin cambios al sistema. Al solicitar un diagnóstico o una respuesta,
la captura, nombres de procesos, reporte e historial pertinente se envían a OpenRouter y al
proveedor del modelo configurado. Las actualizaciones de telemetría no llaman al LLM.
La conversación solo vive en la memoria de la página y se pierde al recargar; el backend
no persiste el historial ni los diagnósticos en disco. No compartas claves, contraseñas o
información sensible en las preguntas.

La API está pensada para ejecutarse en localhost y no incorpora autenticación de usuarios.
Mantén el enlace local por defecto. Para acceso remoto se requiere autenticación y control
de acceso antes de exponer datos del equipo.

### Pruebas

Desde la raíz del proyecto:

```bash
cd api
.venv/bin/python -m unittest discover -s tests -v
```

Las pruebas usan respuestas simuladas del proveedor y no consumen crédito de OpenRouter.
Cubren contexto, caducidad, validación del historial, nivel de alerta, errores, política
pasiva y ausencia de sensores. Para comprobar el frontend:

```bash
cd web
pnpm exec tsc --noEmit
pnpm build
```


## Espacio de trabajo y respuestas en vivo

En escritorio, el sistema y su reporte ocupan el panel izquierdo; el asistente permanece a la
derecha. Cada panel tiene su propio desplazamiento y el campo de escritura queda fijo en la
parte inferior del chat. Los procesos y la información de privacidad se pueden desplegar cuando
los necesites. En móvil, **Sistema** y **Asistente** cambian de vista sin desmontar la conversación
ni interrumpir una respuesta.

Mientras se genera el diagnóstico, el asistente muestra una pantalla de espera. El reporte JSON
se presenta cuando el modelo termina y supera la validación. En las preguntas de seguimiento,
la interfaz muestra un indicador hasta recibir el primer fragmento y luego renderiza la respuesta
progresivamente mediante streaming real del proveedor.

Las respuestas admiten Markdown: títulos, negritas, listas, tablas, citas, enlaces y código en línea.
Se utiliza `react-markdown` con `remark-gfm`, sin HTML crudo. Los enlaces inseguros se filtran y
las imágenes de respuestas no descargan recursos externos automáticamente. El reporte también
interpreta Markdown en sus textos.

**Detener** cancela la consulta y conserva la pregunta para reintentar. Si ya había texto, se muestra
como **Respuesta incompleta**; ese turno no se añade al historial enviado al modelo hasta completar
una respuesta. Una desconexión sin evento de finalización también se considera un error.
El desplazamiento acompaña los fragmentos mientras estás al final del chat; si subes para leer,
se respeta tu posición y aparece **Ir al último mensaje**.

### Endpoint SSE

`POST /api/chat/stream` acepta el mismo cuerpo validado que `/api/chat`. Devuelve
`Content-Type: text/event-stream` con eventos separados por una línea vacía:

- `status`: `{ "status": "waiting" }`, confirma que la consulta está en curso.
- `delta`: `{ "content": "fragmento de Markdown" }`, agrega texto a la respuesta.
- `done`: `{ "diagnostic_id": "UUID" }`, confirma la finalización correcta.
- `error`: `{ "message": "mensaje seguro", "status": 502 }`, indica un fallo durante el stream.

Un contexto vencido o una entrada inválida conserva el código HTTP 410 o 422 antes de abrir
el stream. Una vez enviadas las cabeceras, los errores se comunican con el evento `error` y no
se envía `done`. Se desactiva el buffering con `X-Accel-Buffering: no` y `Cache-Control: no-cache,
no-transform`; un proxy inverso también debe permitir entregar SSE sin agrupar fragmentos.
El endpoint JSON `/api/chat` se conserva para otros clientes.

Pruebas del lector SSE (Node.js 22.6+):

```bash
cd web
pnpm test
```

Incluyen UTF-8 dividido entre paquetes, tramas fragmentadas, respuestas progresivas, fallos a
mitad del stream, desconexiones y cancelación sin esperar confirmación del transporte.
