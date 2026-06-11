const crypto = require('crypto');
const XLSX = require('xlsx');

// Parser tolerante de extractos bancarios (Excel/CSV), pensado para el export
// de BBVA pero sin acoplarse a él: localiza la fila de cabecera donde esté,
// mapea las columnas por nombre (con sinónimos) y admite fechas e importes
// en varios formatos. Si BBVA cambia el layout, esto debería seguir tragando.

const HEADER_HINTS = {
  fecha: [/^fecha$/i, /fecha (operaci|contable)/i],
  fechaValor: [/fecha valor/i, /f\.? ?valor/i],
  concepto: [/concepto/i, /descripci/i],
  movimiento: [/^movimiento/i, /detalle/i, /m[áa]s datos/i],
  importe: [/importe/i, /cantidad/i, /amount/i],
  divisa: [/^divisa/i, /moneda/i, /currency/i],
  disponible: [/disponible/i, /saldo/i, /balance/i],
  observaciones: [/observac/i, /notas?/i],
};

const norm = (v) => String(v ?? '').trim();

// ¿Esta fila parece la cabecera? Debe nombrar al menos fecha + importe.
function looksLikeHeader(row) {
  const cells = row.map(norm).filter(Boolean);
  const has = (patterns) => cells.some((c) => patterns.some((rx) => rx.test(c)));
  return has([/fecha/i]) && has(HEADER_HINTS.importe);
}

// Mapea índice de columna para cada campo. La primera pasada usa los patrones
// preferentes (p. ej. "Fecha" exacta antes que "Fecha valor").
function mapColumns(headerRow) {
  const cols = {};
  for (const [field, patterns] of Object.entries(HEADER_HINTS)) {
    for (const rx of patterns) {
      const idx = headerRow.findIndex((c, i) => rx.test(norm(c)) && !Object.values(cols).includes(i));
      if (idx !== -1) { cols[field] = idx; break; }
    }
  }
  // Sin columna "Fecha" a secas, vale la fecha valor.
  if (cols.fecha === undefined && cols.fechaValor !== undefined) cols.fecha = cols.fechaValor;
  return cols;
}

// Fecha: Date nativa, serial de Excel, "DD/MM/YYYY", "DD-MM-YYYY" o ISO.
function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = norm(v);
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return null;
}

// Importe: número nativo o texto en formato español ("1.234,56") o anglosajón.
function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = norm(v).replace(/[€\s]/g, '');
  if (!s || /^-?$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // El separador más a la derecha es el decimal; el otro, miles.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Parsea el archivo (xlsx/xls/csv) y devuelve movimientos normalizados
// más el saldo más reciente si el extracto lo trae.
function parseBankFile(buffer) {
  // Los .xlsx/.xls van firmados (PK / D0CF); lo demás es CSV/texto. El CSV se
  // lee en crudo (raw) para que SheetJS no "adivine" fechas en formato
  // americano (nuestras DD/MM las parsea parseDate), y con la codificación
  // detectada: UTF-8 si los bytes lo son, si no Windows-1252 (latin-1, lo
  // habitual en exports de banca española).
  const isBinary = buffer[0] === 0x50 && buffer[1] === 0x4b; // zip (xlsx)
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf; // xls antiguo
  let wb;
  if (isBinary || isOle) {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } else {
    let codepage = 65001; // UTF-8
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      codepage = 1252;
    }
    wb = XLSX.read(buffer, { type: 'buffer', raw: true, codepage });
  }
  // La hoja con más filas es la de movimientos (los informes a veces traen portada).
  const sheet = wb.SheetNames
    .map((name) => wb.Sheets[name])
    .sort((a, b) => XLSX.utils.decode_range(b['!ref'] || 'A1').e.r - XLSX.utils.decode_range(a['!ref'] || 'A1').e.r)[0];
  if (!sheet) throw new Error('El archivo no tiene ninguna hoja con datos');

  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerIdx = grid.findIndex(looksLikeHeader);
  if (headerIdx === -1) {
    throw new Error('No encuentro la cabecera del extracto (busco columnas tipo "Fecha" e "Importe"). ¿Es un export de movimientos?');
  }
  const cols = mapColumns(grid[headerIdx]);
  if (cols.fecha === undefined || cols.importe === undefined) {
    throw new Error('La cabecera no tiene columnas reconocibles de fecha e importe');
  }

  const rows = [];
  let balance = null;
  for (const raw of grid.slice(headerIdx + 1)) {
    const date = parseDate(raw[cols.fecha]);
    const amount = parseAmount(raw[cols.importe]);
    if (!date || amount === null || amount === 0) continue; // pies de página, filas vacías

    const concepto = norm(raw[cols.concepto]);
    const movimiento = norm(raw[cols.movimiento]);
    const disponible = cols.disponible !== undefined ? parseAmount(raw[cols.disponible]) : null;

    const externalId = 'import:' + crypto.createHash('sha1')
      .update([date.toISOString().slice(0, 10), amount.toFixed(2), concepto, movimiento, disponible ?? ''].join('|'))
      .digest('hex');

    rows.push({
      date,
      amount,
      description: concepto || movimiento || 'Movimiento importado',
      counterparty: concepto ? movimiento : '',
      notes: cols.observaciones !== undefined ? norm(raw[cols.observaciones]) : '',
      currency: cols.divisa !== undefined ? norm(raw[cols.divisa]) || 'EUR' : 'EUR',
      externalId,
      disponible,
    });

    // Saldo del movimiento más reciente que lo informe.
    if (disponible !== null && (!balance || date >= balance.date)) {
      balance = { amount: disponible, date };
    }
  }

  if (rows.length === 0) throw new Error('Encontré la cabecera pero ninguna fila con fecha e importe válidos');
  return { rows, balance };
}

module.exports = { parseBankFile, parseDate, parseAmount };
