# API de Olimpo — referencia para el agente

Base: `https://TU-DOMINIO/api` (en desarrollo `http://localhost:4000/api`).
Autenticación: header `Authorization: Bearer <AGENT_API_KEY>` en todas las llamadas.

## Reglas para el agente

- **GET**: libre en toda la API.
- **POST/PUT/PATCH**: solo en `/invoices`, `/tasks`, `/notes`, `/workouts`. Toda escritura debe incluir el campo `"motivo"` en el body (una frase explicando el porqué). Queda registrada en auditoría.
- **DELETE**: prohibido. Si Victor quiere borrar algo, que lo haga desde la web.
- Las facturas se crean siempre como **borrador** y sin número. Solo Victor las emite (o pídeselo explícitamente y emite con su confirmación vía `/invoices/:id/emit`).
- Las facturas emitidas son inmutables: no intentes editarlas.
- Los errores devuelven `{ "error": "explicación" }` — lee el mensaje, suele decir exactamente qué falta.

## Facturación

- `GET /invoices/summary` → `{ pendienteCobro: { total, facturas }, porAño: [...] }` — cuánto le deben a Victor.
- `GET /invoices?status=borrador|enviada|cobrada` → lista de facturas.
- `POST /invoices` → crea borrador.
  ```json
  { "clientId": "<id>", "items": [{ "concept": "Desarrollo web", "quantity": 1, "price": 500 }], "notes": "", "motivo": "Victor pidió factura para X" }
  ```
  `ivaPct` y `irpfPct` son opcionales (por defecto 21 y 7). Si no sabes el `clientId`, haz `GET /clients` primero; el error de cliente desconocido también lista los disponibles.
- `PATCH /invoices/:id` → edita un borrador (mismos campos).
- `POST /invoices/:id/emit` → asigna número correlativo, congela la factura y genera el PDF. **Solo con confirmación explícita de Victor.**
- `POST /invoices/:id/paid` → marca cobrada. Body opcional: `{ "paidDate": "2026-06-01" }`.
- `GET /invoices/:id/pdf` → descarga el PDF (binario).
- `POST /invoices/import` → factura histórica con PDF adjunto (multipart: `pdf`, `clientId`, `number`, `total`, `issueDate`, `status`).

## Clientes

- `GET /clients` → lista (usa esto para resolver nombres → ids).
- `POST /clients` → `{ "name": "...", "nif": "", "address": "", "city": "", "zip": "", "email": "", "motivo": "..." }` ⚠️ fuera de la lista blanca del agente: pídele a Victor que lo cree en la web, o pide que se amplíe la lista.

## Tareas

- `GET /tasks?when=today|pending|all` → tareas. `today` = pendientes que vencen hoy.
- `POST /tasks` → `{ "text": "Llamar al gestor", "due": "2026-06-12", "motivo": "..." }` (`due` opcional).
- `PATCH /tasks/:id` → `{ "done": true }` para completar, o cambiar `text`/`due`.

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

## Solo lectura para el agente

- `GET /settings` → datos fiscales de Victor y próximo número de factura.
- `GET /settings/audit` → registro de tus propias acciones.
