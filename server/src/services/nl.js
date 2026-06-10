// Convierte texto libre ("hazme la factura del dron para el teatro, 623 euros,
// desglosado en vuelo, planificación y licencia") en los datos de un borrador.
// OpenRouter expone una API compatible con Chat Completions.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

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

function extractJson(content) {
  if (typeof content !== 'string') throw new Error('OpenRouter no devolvió contenido de texto');
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim());

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error('OpenRouter no devolvió JSON válido para la factura');
}

async function parseInvoiceText(text, clientNames, today) {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error('Falta OPENROUTER_API_KEY en el .env del servidor para usar el parser de facturas');
    err.status = 503;
    throw err;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:4000',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'Olimpo',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: [
            'Extraes los datos de una factura de un autónomo español a partir de texto libre, a menudo dictado por voz.',
            `Hoy es ${today}.`,
            `Clientes existentes: ${clientNames.join(' | ') || '(ninguno)'}. Elige clientName de esa lista si el texto se refiere a alguno, aunque lo nombre de forma informal ("el teatro" -> el cliente cuyo nombre contenga Teatro).`,
            'Los importes que mencione el usuario son base imponible salvo que diga lo contrario. No calcules IVA ni IRPF: solo conceptos y precios.',
            'Si pide desglosar un total, inventa conceptos profesionales coherentes con el trabajo descrito cuyos precios sumen exactamente ese total.',
            'Devuelve solo JSON válido que cumpla el esquema. No añadas explicaciones.',
          ].join('\n'),
        },
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'invoice_draft',
          strict: true,
          schema: SCHEMA,
        },
      },
      provider: {
        require_parameters: true,
      },
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || data?.error || `OpenRouter respondió con HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  return extractJson(content);
}

module.exports = { parseInvoiceText };
