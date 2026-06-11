# API de Olimpo — referencia para el agente

Base: `https://TU-DOMINIO/api` (en desarrollo `http://localhost:4000/api`).
Autenticación: header `Authorization: Bearer <AGENT_API_KEY>` en todas las llamadas.

## Reglas para el agente

- **GET**: libre en toda la API.
- **POST/PUT/PATCH**: solo en `/invoices`, `/recurring`, `/tasks`, `/projects`, `/notes`, `/workouts`, `/transactions`, `/categories`, `/pending`. Toda escritura debe incluir el campo `"motivo"` en el body (una frase explicando el porqué). Queda registrada en auditoría. `/bank` (conexión bancaria) NO es escribible por el agente.
- **DELETE**: prohibido. Si Victor quiere borrar algo, que lo haga desde la web.
- Las facturas se crean siempre como **borrador** y sin número. Solo Victor las emite (o pídeselo explícitamente y emite con su confirmación vía `/invoices/:id/emit`).
- Las facturas emitidas son inmutables: no intentes editarlas.
- Los errores devuelven `{ "error": "explicación" }` — lee el mensaje, suele decir exactamente qué falta.

## Facturación

- `GET /recurring` → plantillas de factura recurrente (p. ej. la mensualidad del Teatro Soho).
- `POST /recurring/:id/generate` → crea el borrador del periodo. Body opcional `{ "month": 5, "year": 2026 }`; sin body usa el mes anterior al actual. Los placeholders `{MES}` y `{AÑO}` del asunto y los conceptos se rellenan solos. **Esta es la forma preferida de crear la factura mensual del Teatro.**
- `POST /recurring` → crea una plantilla nueva (`name`, `clientId`, `items`, `subjectTemplate`, `motivo`).
- `GET /invoices/summary` → `{ pendienteCobro: { total, facturas }, porAño: [...] }` — cuánto le deben a Victor.
- `GET /invoices?status=borrador|enviada|cobrada` → lista de facturas.
- `POST /invoices` → crea borrador.
  ```json
  { "clientId": "<id>", "items": [{ "concept": "Desarrollo web", "quantity": 1, "price": 500 }], "notes": "", "motivo": "Victor pidió factura para X" }
  ```
  `ivaPct` y `irpfPct` son opcionales (por defecto 21 y 7). `subject` (opcional) es la línea bajo la fecha, p. ej. "Servicios correspondientes al mes de mayo de 2026". Si no sabes el `clientId`, haz `GET /clients` primero; el error de cliente desconocido también lista los disponibles.
- `POST /invoices/nl` → `{ "text": "factura para el teatro de 623 € por el vuelo de dron...", "motivo": "..." }` crea un borrador a partir de texto libre (el servidor lo parsea con un LLM). Tú ya eres un LLM: normalmente te saldrá mejor construir el JSON y usar `POST /invoices`; usa esta ruta solo si quieres reenviar texto crudo del usuario.
- `PATCH /invoices/:id` → edita un borrador (mismos campos).
- `POST /invoices/:id/emit` → asigna número correlativo, congela la factura y genera el PDF. **Solo con confirmación explícita de Victor.**
- `POST /invoices/:id/paid` → marca cobrada. Body opcional: `{ "paidDate": "2026-06-01" }`.
- `GET /invoices/:id/pdf` → descarga el PDF (binario).
- `POST /invoices/import` → factura histórica con PDF adjunto (multipart: `pdf`, `clientId`, `number`, `total`, `issueDate`, `status`).

## Clientes

- `GET /clients` → lista (usa esto para resolver nombres → ids).
- `POST /clients` → `{ "name": "...", "nif": "", "address": "", "city": "", "zip": "", "email": "", "motivo": "..." }` ⚠️ fuera de la lista blanca del agente: pídele a Victor que lo cree en la web, o pide que se amplíe la lista.

## Tareas y proyectos

Las tareas se organizan en proyectos (áreas de vida: trabajo, casa, salud…) y tienen
estado (`pendiente` → `en_curso` → `hecha`) y prioridad (`baja|media|alta|urgente`).

- `GET /projects` → áreas con su recuento de tareas sin terminar (úsalo para resolver nombre → id).
- `POST /projects` → `{ "name": "Salud", "color": "#5f6b3c", "motivo": "..." }`.
- `GET /tasks?when=today|pending|all&project=<id|none>&status=<estado>` → filtros combinables. `today` = sin terminar que vencen hoy (úsalo para el resumen matinal).
- `POST /tasks` → `{ "text": "Llamar al gestor", "due": "2026-06-12", "project": "<id>", "priority": "alta", "motivo": "..." }` (todo opcional salvo `text`).
- `PATCH /tasks/:id` → cambia `status`, `text`, `due`, `priority` o `project`. `{ "done": true }` también vale como atajo de `status: "hecha"`.

## Notas

- `GET /notes?q=palabra` → busca en título y contenido.
- `GET /notes/:id` → nota completa.
- `POST /notes` → `{ "title": "", "content": "markdown", "tags": [], "motivo": "..." }`.
- `PATCH /notes/:id` → edita.

## Gimnasio

- `GET /workouts?limit=30` → últimos entrenos.
- `POST /workouts` →
  ```json
  { "date": "2026-06-10", "type": "empuje", "entries": [{ "exercise": "Press banca", "sets": 4, "reps": 8, "weight": 70 }], "motivo": "..." }
  ```

## Finanzas (gastos, banco y cobros)

Movimientos de cuenta (gastos e ingresos), categorías y cobros pendientes sin
factura. Los movimientos entran por el banco (GoCardless), import o a mano.
El signo de `amount` marca el sentido: **negativo = gasto, positivo = ingreso**.

- `GET /transactions/summary` → estadísticas: `saldo` (último saldo conocido de la cuenta), `proyeccion` (saldo + todo lo pendiente de cobro), `porMes` (ingreso/gasto/neto mes a mes), `porCategoria` (gasto por categoría), `pendienteCobro: { facturas, negro }`, `ingresoFiscalAño`. Acepta `?from=&to=`.
- `POST /transactions/import` → sube un extracto bancario (multipart/form-data, campo `file`, .xlsx/.xls/.csv — el export de movimientos de BBVA tal cual). Tolera variaciones de formato: localiza la cabecera, mapea columnas por nombre y entiende fechas/importes españoles. Deduplica (re-subir el mismo extracto no duplica), autocategoriza, concilia ingresos con facturas/cobros pendientes y guarda el saldo si el extracto lo trae. ⚠️ Al ser multipart, el motivo va en el header `X-Motivo`, no en el body. Devuelve `{ leidos, nuevos, duplicados, conciliados: [...], saldo }`.
- `POST /transactions/bulk` → varios movimientos de una vez en JSON: `{ "transactions": [{ "date": "2026-06-11", "amount": -49.99, "description": "..." }], "motivo": "..." }`. Idempotente: reintentar el mismo lote no duplica. Mismo pipeline (autocategoría + conciliación).
- `GET /transactions?from=&to=&kind=gasto|ingreso&category=<id>&q=texto&reconciled=true|false` → lista de movimientos (máx. 500).
- `POST /transactions` → apunta un movimiento manual.
  ```json
  { "date": "2026-06-11", "amount": -49.99, "description": "Suscripción Adobe", "category": "<id opcional>", "motivo": "Victor dictó este gasto" }
  ```
  Si no pasas `category`, se autocategoriza por las reglas. Si `amount` es positivo, intenta conciliarlo con una factura enviada o un cobro pendiente (cobro automático si hay match único).
- `PATCH /transactions/:id` → cambia `category`, `notes`, `ignored` (excluir de stats), `kind`.
- `POST /transactions/:id/unreconcile` → deshace un cobro automático (la factura vuelve a `enviada`).
- `POST /transactions/:id/confirm` → confirma una sugerencia ambigua: `{ "invoiceId": "..." }` o `{ "pendingId": "..." }`.
- `GET /categories` → categorías de gasto/ingreso (con `color`, `emoji`, `rules`). La primera vez siembra unas por defecto.
- `POST /categories` → `{ "name": "...", "kind": "gasto|ingreso", "color": "#39FF14", "emoji": "💾", "rules": ["adobe", "github"], "motivo": "..." }`.
- `PATCH /categories/:id` → edita.
- `GET /pending` → cobros pendientes SIN factura (lo que Victor cobra "en negro"). `?status=pendiente|cobrado`.
- `POST /pending` → `{ "concept": "Grabación boda", "clientId": "<opcional>", "amount": 300, "expectedDate": "2026-06-20", "motivo": "..." }`.
- `POST /pending/:id/paid` → marca cobrado. Body opcional `{ "paidDate": "..." }`.
- `GET /bank/status` → estado de la conexión con el banco (`configured`, `status`, cuentas, último sync). **Solo lectura para el agente; conectar/sincronizar el banco se hace desde la web.**

## Solo lectura para el agente

- `GET /settings` → datos fiscales de Victor y próximo número de factura.
- `GET /settings/audit` → registro de tus propias acciones.
- `GET /bank/status` → estado de la conexión bancaria (las acciones `/bank/connect|finalize|sync` no son del agente).
