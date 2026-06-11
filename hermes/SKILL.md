---
name: olimpo
description: Gestiona el hub personal de Victor (Olimpo) en este mismo servidor - facturas de autónomo, clientes, tareas por proyectos, notas, entrenos de gimnasio y finanzas (gastos, categorías y cobros pendientes). Usar siempre que Victor pida crear/consultar facturas, apuntar tareas o notas, registrar entrenos, apuntar un gasto, preguntar en qué gasta, o preguntar cuánto le deben.
---

# Olimpo — hub personal de Victor

API REST en este mismo servidor: `http://localhost:4000/api`

Autenticación: header `Authorization: Bearer __AGENT_API_KEY__`

## Reglas innegociables

1. **GET libre; POST/PATCH solo en** `/invoices`, `/recurring`, `/tasks`, `/projects`, `/notes`, `/workouts`, `/transactions`, `/categories`, `/pending`. DELETE está bloqueado para ti, y `/bank` (conexión bancaria) tampoco lo puedes tocar.
2. **Toda escritura debe llevar el campo `"motivo"`** en el body (una frase). Sin él, la API la rechaza. Queda auditado.
3. Las facturas se crean como **borrador** y sin número. NUNCA emitas (`/emit`) sin confirmación explícita de Victor en ese momento: emitir asigna número correlativo fiscal y es irreversible.
4. Las facturas emitidas son inmutables. Los errores de la API devuelven `{"error": "..."}` con la explicación: léela y corrige.

## Facturación (lo más importante para Victor)

- Resumen "¿cuánto me deben?": `GET /invoices/summary`
- **Factura mensual del Teatro Soho**: `GET /recurring` para obtener el id de la plantilla y luego `POST /recurring/<id>/generate` con `{"motivo":"..."}` (genera el borrador del MES ANTERIOR; para otro mes añade `"month":5,"year":2026`). Esta es SIEMPRE la vía preferida para la factura del Teatro.
- Factura nueva: `POST /invoices` con `{"clientId","items":[{"concept","quantity","price"}],"subject","notes","motivo"}`. Los precios son base imponible (el IVA 21% e IRPF -7% los calcula el servidor). Resuelve clientId con `GET /clients`. Si Victor da un total y pide desglose, reparte en conceptos profesionales que sumen exacto.
- `subject` es la línea bajo la fecha, p. ej. "Servicios correspondientes al mes de mayo de 2026".
- Tras crear un borrador, dile a Victor el total y que puede revisarlo y emitirlo en http://100.93.76.49:4000/facturas — o, si te lo confirma, emítelo tú con `POST /invoices/<id>/emit` y dale el enlace al PDF: `http://100.93.76.49:4000/api/invoices/<id>/pdf`
- Marcar cobrada: `POST /invoices/<id>/paid`
- Importar factura antigua con PDF: `POST /invoices/import` (multipart: pdf, clientId, number, total, issueDate, status)

## Tareas y proyectos

- `GET /tasks?when=today|pending&project=<id>` — "today" para el repaso matinal.
- `POST /tasks` → `{"text","due":"YYYY-MM-DD","priority":"baja|media|alta|urgente","project":"<id>","motivo"}` (todo opcional salvo text). `GET /projects` para resolver nombres de áreas; puedes crear áreas con POST /projects.
- Completar: `PATCH /tasks/<id>` con `{"status":"hecha","motivo"}` (estados: pendiente, en_curso, hecha).

## Notas

Son páginas jerárquicas estilo wiki: `parentId` apunta a la página madre (`null` = raíz).

- Buscar: `GET /notes?q=palabra` · Todas (con jerarquía): `GET /notes`
- Crear: `POST /notes` con `{"title","content"(markdown),"parentId"(opcional),"motivo"}`. Si Victor pide guardar algo "dentro de" otra página, resuelve su `_id` primero y úsalo como `parentId`.
- Editar: `PATCH /notes/<id>` (`title`, `content`, `parentId`). Para añadir contenido sin pisar lo que hay, lee la nota primero y reenvía el `content` completo.

## Gimnasio

- `POST /workouts` → `{"date","type","entries":[{"exercise","sets","reps","weight"}],"notes","motivo"}` · Histórico: `GET /workouts`

## Finanzas (gastos, banco y cobros)

Gastos e ingresos de la cuenta, categorizados, y cobros pendientes sin factura
("en negro"). Signo de `amount`: **negativo = gasto, positivo = ingreso**.

- "¿En qué gasto / cómo voy de finanzas?": `GET /transactions/summary` → `saldo` (último saldo de la cuenta), `proyeccion` (saldo + todo lo pendiente cobrado), ingreso/gasto/neto por mes, gasto por categoría, y pendiente de cobro (facturas + negro).
- Apuntar un gasto que dicte Victor: `POST /transactions` → `{"date":"YYYY-MM-DD","amount":-49.99,"description":"Suscripción Adobe","motivo":"..."}`. Sin `category` se autocategoriza por reglas. Si el importe es positivo, el servidor intenta conciliarlo con una factura/cobro pendiente (cobro automático si hay match único).
- **Si Victor te manda el Excel de movimientos de BBVA (por Telegram)**: guárdalo y súbelo TAL CUAL, sin transformarlo:
  ```bash
  curl -s -X POST http://localhost:4000/api/transactions/import \
    -H "Authorization: Bearer __AGENT_API_KEY__" \
    -H "X-Motivo: Victor envió su extracto de BBVA por Telegram" \
    -F "file=@/ruta/al/extracto.xlsx"
  ```
  (multipart: el motivo va en el header `X-Motivo`). El servidor deduplica (re-subir no duplica), autocategoriza, concilia los ingresos con facturas/cobros pendientes y actualiza el saldo. Resume a Victor la respuesta: `nuevos`, `duplicados`, `conciliados` (¡dile qué facturas se marcaron cobradas!) y `saldo`.
- Si Victor te dicta varios gastos de golpe: `POST /transactions/bulk` con `{"transactions":[{"date","amount","description"}...],"motivo":"..."}` (idempotente: reintentar no duplica).
- Listar/buscar: `GET /transactions?kind=gasto|ingreso&category=<id>&q=texto`. Categorías: `GET /categories` (crear con `POST /categories`).
- Cobros en negro (sin factura): `GET /pending`, `POST /pending` → `{"concept","amount","clientId"(opcional),"expectedDate","motivo"}`, marcar cobrado con `POST /pending/<id>/paid`.
- Conectar/sincronizar el banco NO es cosa tuya: lo hace Victor desde la web (`/finanzas`). Puedes consultar el estado con `GET /bank/status`.

## Otros

- `GET /settings` → datos fiscales de Victor y próximo número de factura (solo lectura).
- `GET /settings/audit` → tu propio registro de acciones.
