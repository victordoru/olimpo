const Invoice = require('../models/Invoice');
const PendingPayment = require('../models/PendingPayment');
const AuditLog = require('../models/AuditLog');

const CENT = 0.01;
// Ventana de fechas razonable: un cobro suele entrar cerca de la emisión,
// pero damos margen amplio (los clientes pagan tarde).
const MAX_DAYS = 120;

const within = (a, b, days) => Math.abs(a - b) <= days * 24 * 60 * 60 * 1000;
const sameAmount = (a, b) => Math.abs(a - b) < CENT;

// Concilia un movimiento ENTRANTE (amount > 0) con una factura enviada o un
// cobro pendiente. Match único y exacto → lo marca cobrado automáticamente y
// lo registra en AuditLog. Varios candidatos → los deja como sugerencia.
// Devuelve un resumen de lo que hizo. No lanza: la conciliación es best-effort.
async function reconcileTransaction(txn) {
  if (!txn || txn.amount <= 0 || txn.ignored) return { matched: false };
  if (txn.reconciledInvoice || txn.reconciledPending) return { matched: false };

  const txTime = new Date(txn.date).getTime();

  const [invoices, pendings] = await Promise.all([
    Invoice.find({ status: 'enviada' }).populate('client', 'name'),
    PendingPayment.find({ status: 'pendiente' }).populate('client', 'name'),
  ]);

  const invMatches = invoices.filter(
    (inv) => sameAmount(inv.total, txn.amount) &&
      within(txTime, new Date(inv.issueDate || inv.createdAt).getTime(), MAX_DAYS)
  );
  const penMatches = pendings.filter(
    (p) => sameAmount(p.amount, txn.amount) &&
      within(txTime, new Date(p.expectedDate || p.createdAt).getTime(), MAX_DAYS)
  );

  const total = invMatches.length + penMatches.length;

  // Match único y sin ambigüedad → auto-cobro.
  if (total === 1) {
    if (invMatches.length === 1) {
      const inv = invMatches[0];
      inv.status = 'cobrada';
      inv.paidDate = txn.date;
      await inv.save();
      txn.reconciledInvoice = inv._id;
      await txn.save();
      await AuditLog.create({
        actor: 'reconcile', method: 'AUTO', path: `/invoices/${inv._id}/paid`,
        body: { transaction: String(txn._id), amount: txn.amount },
        reason: `Cobro automático: el movimiento de ${txn.amount}€ del ${new Date(txn.date).toISOString().slice(0, 10)} coincide con la factura Nº ${inv.number}`,
        statusCode: 200,
      });
      return { matched: true, type: 'invoice', invoice: inv };
    }
    const pen = penMatches[0];
    pen.status = 'cobrado';
    pen.paidDate = txn.date;
    pen.paidTransaction = txn._id;
    await pen.save();
    txn.reconciledPending = pen._id;
    await txn.save();
    await AuditLog.create({
      actor: 'reconcile', method: 'AUTO', path: `/pending/${pen._id}/paid`,
      body: { transaction: String(txn._id), amount: txn.amount },
      reason: `Cobro automático: el movimiento de ${txn.amount}€ coincide con el cobro pendiente "${pen.concept}"`,
      statusCode: 200,
    });
    return { matched: true, type: 'pending', pending: pen };
  }

  // Ambiguo → guardamos sugerencias para que Victor confirme a mano.
  if (total > 1) {
    txn.suggestedInvoices = invMatches.map((i) => i._id);
    txn.suggestedPendings = penMatches.map((p) => p._id);
    await txn.save();
    return { matched: false, suggestions: total };
  }

  return { matched: false };
}

// Revierte un auto-cobro: vuelve la factura/pendiente a su estado anterior.
async function unreconcileTransaction(txn) {
  let reverted = null;
  if (txn.reconciledInvoice) {
    const inv = await Invoice.findById(txn.reconciledInvoice);
    if (inv && inv.status === 'cobrada') {
      inv.status = 'enviada';
      inv.paidDate = null;
      await inv.save();
      reverted = { type: 'invoice', id: inv._id };
    }
    txn.reconciledInvoice = null;
  }
  if (txn.reconciledPending) {
    const pen = await PendingPayment.findById(txn.reconciledPending);
    if (pen && pen.status === 'cobrado') {
      pen.status = 'pendiente';
      pen.paidDate = null;
      pen.paidTransaction = null;
      await pen.save();
      reverted = { type: 'pending', id: pen._id };
    }
    txn.reconciledPending = null;
  }
  await txn.save();
  if (reverted) {
    await AuditLog.create({
      actor: 'reconcile', method: 'AUTO', path: `/transactions/${txn._id}/unreconcile`,
      body: { reverted }, reason: 'Conciliación deshecha manualmente', statusCode: 200,
    });
  }
  return reverted;
}

module.exports = { reconcileTransaction, unreconcileTransaction };
