// Autocategorización: asigna a un movimiento la primera categoría cuya regla
// (subcadena) aparezca en su descripción/contraparte. Solo categoriza gastos
// con categorías de gasto e ingresos con categorías de ingreso.

function autocategorize(txn, categories) {
  const haystack = `${txn.description || ''} ${txn.counterparty || ''}`.toLowerCase();
  if (!haystack.trim()) return null;
  const kind = txn.amount < 0 ? 'gasto' : 'ingreso';
  for (const cat of categories) {
    if (cat.kind !== kind) continue;
    for (const rule of cat.rules || []) {
      const needle = String(rule).trim().toLowerCase();
      if (needle && haystack.includes(needle)) return cat._id;
    }
  }
  return null;
}

module.exports = { autocategorize };
