// Notificaciones salientes a Victor (recordatorios de tareas, avisos).
// Canal único configurado por .env — el servidor envía directo, sin pasar
// por Hermes ni gastar tokens. Adaptadores disponibles:
//
//   whatsapp  → WhatsApp Cloud API oficial de Meta (necesita app + número business)
//               WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO
//   callmebot → CallMeBot (WhatsApp al móvil personal, gratis, setup de 1 minuto)
//               CALLMEBOT_PHONE, CALLMEBOT_APIKEY
//   telegram  → bot de Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
//
// NOTIFY_CHANNEL fuerza uno; si no, se usa el primero que esté configurado
// (orden: whatsapp, callmebot, telegram). Sin ninguno, se loguea a consola.

async function sendWhatsAppCloud(text) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO } = process.env;
  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: WHATSAPP_TO,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp Cloud API ${res.status}: ${data.error?.message || 'error'}`);
  }
}

async function sendCallMeBot(text) {
  const { CALLMEBOT_PHONE, CALLMEBOT_APIKEY } = process.env;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(CALLMEBOT_PHONE)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok || /error/i.test(body)) throw new Error(`CallMeBot: ${body.slice(0, 200)}`);
}

async function sendTelegram(text) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Telegram ${res.status}: ${data.description || 'error'}`);
  }
}

const CHANNELS = {
  whatsapp: {
    send: sendWhatsAppCloud,
    configured: () => process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TO,
  },
  callmebot: {
    send: sendCallMeBot,
    configured: () => process.env.CALLMEBOT_PHONE && process.env.CALLMEBOT_APIKEY,
  },
  telegram: {
    send: sendTelegram,
    configured: () => process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
  },
};

function activeChannel() {
  const forced = process.env.NOTIFY_CHANNEL;
  if (forced && CHANNELS[forced]?.configured()) return forced;
  return Object.keys(CHANNELS).find((name) => CHANNELS[name].configured()) || null;
}

// Envía `text` por el canal activo. Devuelve el canal usado.
async function notify(text) {
  const name = activeChannel();
  if (!name) {
    console.log(`[notify] (sin canal configurado) ${text}`);
    return 'console';
  }
  await CHANNELS[name].send(text);
  return name;
}

module.exports = { notify, activeChannel };
