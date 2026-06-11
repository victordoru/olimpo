// Cliente de la API de GoCardless Bank Account Data (antes Nordigen):
// acceso PSD2 de solo lectura a los movimientos del banco. Gratis.
// Documentación: https://developer.gocardless.com/bank-account-data
//
// Las claves van en el .env del servidor (NUNCA en el repo):
//   GOCARDLESS_SECRET_ID, GOCARDLESS_SECRET_KEY, GOCARDLESS_REDIRECT_URI
// Si faltan, isConfigured() es false y las rutas /bank responden "no configurado".

const BASE = 'https://bankaccountdata.gocardless.com/api/v2';

function isConfigured() {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

// Token de acceso cacheado en memoria (vive ~24h; lo renovamos al caducar).
let cached = { access: null, expiresAt: 0 };

async function gcFetch(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.summary || JSON.stringify(data);
    const err = new Error(`GoCardless ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function getToken() {
  if (!isConfigured()) {
    const err = new Error('GoCardless no configurado: faltan GOCARDLESS_SECRET_ID y GOCARDLESS_SECRET_KEY en el .env del servidor.');
    err.status = 503;
    throw err;
  }
  if (cached.access && Date.now() < cached.expiresAt - 60_000) return cached.access;
  const data = await gcFetch('/token/new/', {
    method: 'POST',
    body: { secret_id: process.env.GOCARDLESS_SECRET_ID, secret_key: process.env.GOCARDLESS_SECRET_KEY },
  });
  cached = { access: data.access, expiresAt: Date.now() + (data.access_expires || 3600) * 1000 };
  return cached.access;
}

// Bancos disponibles en un país (por defecto España).
async function getInstitutions(country = 'es') {
  const token = await getToken();
  return gcFetch(`/institutions/?country=${encodeURIComponent(country)}`, { token });
}

// Crea la requisición: devuelve el "link" al que Victor va para autorizar en su banco.
async function createRequisition(institutionId, redirect, reference) {
  const token = await getToken();
  return gcFetch('/requisitions/', {
    method: 'POST', token,
    body: { institution_id: institutionId, redirect, reference: reference || String(Date.now()) },
  });
}

// Tras autorizar, la requisición trae los ids de cuenta conectados.
async function getRequisition(requisitionId) {
  const token = await getToken();
  return gcFetch(`/requisitions/${requisitionId}/`, { token });
}

async function getAccountDetails(accountId) {
  const token = await getToken();
  return gcFetch(`/accounts/${accountId}/details/`, { token });
}

async function getTransactions(accountId) {
  const token = await getToken();
  return gcFetch(`/accounts/${accountId}/transactions/`, { token });
}

// Normaliza un movimiento de GoCardless a nuestro esquema Transaction.
// GoCardless da el importe ya con signo (negativo = cargo).
function normalize(tx, accountId) {
  const amount = Number(tx.transactionAmount?.amount ?? 0);
  const description = (tx.remittanceInformationUnstructured ||
    (Array.isArray(tx.remittanceInformationUnstructuredArray) ? tx.remittanceInformationUnstructuredArray.join(' ') : '') ||
    tx.additionalInformation || '').trim();
  const counterparty = (tx.creditorName || tx.debtorName || '').trim();
  return {
    source: 'gocardless',
    externalId: tx.transactionId || tx.internalTransactionId || `${accountId}:${tx.bookingDate}:${amount}:${description}`,
    account: accountId,
    date: new Date(tx.bookingDate || tx.valueDate || Date.now()),
    amount,
    currency: tx.transactionAmount?.currency || 'EUR',
    description,
    counterparty,
    raw: tx,
  };
}

module.exports = {
  isConfigured, getInstitutions, createRequisition, getRequisition,
  getAccountDetails, getTransactions, normalize,
};
