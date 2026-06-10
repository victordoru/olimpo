const Anthropic = require('@anthropic-ai/sdk');

// Convierte texto libre ("hazme la factura del dron para el teatro, 623 euros,
// desglosado en vuelo, planificación y licencia") en los datos de un borrador.
// Usa salida estructurada con JSON Schema: la respuesta siempre es JSON válido.

const SCHEMA = {
  type: 'object',
  properties: {
    clientName: {
      type: 'string',
      description: 'Nombre del cliente, lo más parecido posible a uno de la lista dada',
    },
    subject: {
      type: 'string',
      description: 'Línea de asunto bajo la fecha, p. ej. "Servicios correspondientes al mes de mayo de 2026". Cadena vacía si no aplica.',
    },
    items: {
      type: 'array',
      description: 'Líneas de la factura. Si el usuario da un total y pide desglose, repartir en conceptos razonables que sumen exactamente ese total.',
      items: {
        type: 'object',
        properties: {
          concept: { type: 'string' },
          quantity: { type: 'number' },
          price: { type: 'number', description: 'Precio unitario en euros (base imponible, sin IVA)' },
        },
        required: ['concept', 'quantity', 'price'],
        additionalProperties: false,
      },
    },
    issueDate: {
      type: 'string',
      description: 'Fecha de emisión deseada en formato YYYY-MM-DD, o cadena vacía para usar la fecha de emisión',
    },
    notes: { type: 'string', description: 'Notas adicionales para el pie, o cadena vacía' },
  },
  required: ['clientName', 'subject', 'items', 'issueDate', 'notes'],
  additionalProperties: false,
};

async function parseInvoiceText(text, clientNames, today) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('Falta ANTHROPIC_API_KEY en el .env del servidor para usar el parser de texto');
    err.status = 503;
    throw err;
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    max_tokens: 2048,
    system: [
      'Extraes los datos de una factura de un autónomo español a partir de texto libre (a menudo dictado por voz, con muletillas).',
      `Hoy es ${today}.`,
      `Clientes existentes: ${clientNames.join(' | ') || '(ninguno)'}. Elige clientName de esa lista si el texto se refiere a alguno, aunque lo nombre de forma informal ("el teatro" → el cliente cuyo nombre contenga Teatro).`,
      'Los importes que mencione el usuario son base imponible salvo que diga lo contrario. No calcules IVA ni IRPF: solo conceptos y precios.',
      'Si pide desglosar un total, inventa conceptos profesionales coherentes con el trabajo descrito cuyos precios sumen exactamente el total.',
    ].join('\n'),
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });

  const block = response.content.find((b) => b.type === 'text');
  return JSON.parse(block.text);
}

module.exports = { parseInvoiceText };
