const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const TEMPLATE_PATH = path.join(__dirname, '../templates/invoice.html');
const STORAGE_DIR = path.join(__dirname, '../../storage/invoices');

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

const euros = (n) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

const fecha = (d) =>
  new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderHtml(invoice, settings) {
  const client = invoice.clientSnapshot || invoice.client || {};
  const isDraft = invoice.status === 'borrador';

  const items = invoice.items
    .map(
      (it) => `<tr>
        <td>${esc(it.concept)}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${euros(it.price)}</td>
        <td class="num">${euros(it.quantity * it.price)}</td>
      </tr>`
    )
    .join('\n');

  const clientAddress = [client.address, [client.zip, client.city].filter(Boolean).join(' '), client.country]
    .filter(Boolean)
    .join('<br>');

  const businessAddress = [settings.address, [settings.zip, settings.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');

  const replacements = {
    DRAFT_MARK: isDraft ? '<div class="draft-mark">BORRADOR</div>' : '',
    BUSINESS_NAME: esc(settings.businessName || 'Configura tus datos en Ajustes'),
    BUSINESS_NIF: settings.nif ? `NIF: ${esc(settings.nif)}` : '',
    BUSINESS_ADDRESS: esc(businessAddress),
    BUSINESS_CONTACT: [settings.email, settings.phone].filter(Boolean).map(esc).join(' · '),
    INVOICE_TITLE: isDraft ? 'BORRADOR' : `Factura Nº ${invoice.number}`,
    ISSUE_DATE: fecha(invoice.issueDate || new Date()),
    SUBJECT: invoice.subject ? `<div class="subject">${esc(invoice.subject)}</div>` : '',
    CLIENT_NAME: esc(client.name || ''),
    CLIENT_NIF: client.nif ? `NIF: ${esc(client.nif)}` : '',
    CLIENT_ADDRESS: clientAddress,
    ITEMS: items,
    BASE: euros(invoice.base),
    IVA_PCT: invoice.ivaPct,
    IVA: euros(invoice.iva),
    IRPF_PCT: invoice.irpfPct,
    IRPF: euros(invoice.irpf),
    TOTAL: euros(invoice.total),
    IBAN: esc(settings.iban || ''),
    NOTES: [invoice.notes, settings.invoiceNote].filter(Boolean).map(esc).join('<br>'),
  };

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

async function generateInvoicePdf(invoice, settings) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const filename = invoice.number
    ? `factura-${invoice.number}.pdf`
    : `borrador-${invoice._id}.pdf`;
  const outPath = path.join(STORAGE_DIR, filename);

  const html = renderHtml(invoice, settings);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  } finally {
    await page.close();
  }
  return { path: outPath, filename };
}

module.exports = { generateInvoicePdf, STORAGE_DIR };
