/** Datos mínimos para imprimir una factura BeautyBook */
export type PrintableInvoice = {
  number: string
  status: string
  currency?: string
  subtotal: string | number
  tax: string | number
  total: string | number
  notes?: string | null
  issuedAt: string
  paidAt?: string | null
  client?: {
    firstName: string
    lastName: string
    phone?: string | null
    email?: string | null
  } | null
  items?: Array<{
    description: string
    quantity: number
    unitPrice: string | number
    total: string | number
  }>
  appointment?: {
    startAt?: string
    service?: { name?: string }
    worker?: { firstName?: string; lastName?: string }
  } | null
}

function money(value: string | number | undefined | null, currency = 'COP') {
  const n = Number(value || 0)
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency || 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

function statusLabel(s: string) {
  if (s === 'PAID') return 'Pagada'
  if (s === 'ISSUED') return 'Emitida'
  if (s === 'CANCELLED') return 'Cancelada'
  if (s === 'DRAFT') return 'Borrador'
  return s
}

/**
 * Abre una ventana de impresión con el ticket/factura.
 */
export function printInvoice(
  invoice: PrintableInvoice,
  business?: { name?: string; address?: string; phone?: string; city?: string },
) {
  const biz = business?.name || 'BeautyBook'
  const addr = [business?.address, business?.city].filter(Boolean).join(', ')
  const currency = invoice.currency || 'COP'
  const clientName = invoice.client
    ? `${invoice.client.firstName} ${invoice.client.lastName}`.trim()
    : 'Cliente'
  const items = (invoice.items || [])
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          ${escapeHtml(it.description)}
          <div style="color:#6b7280;font-size:12px;">Cant. ${it.quantity} · ${money(it.unitPrice, currency)}</div>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">
          ${money(it.total, currency)}
        </td>
      </tr>`,
    )
    .join('')

  const apptLine = invoice.appointment?.startAt
    ? `<p style="margin:4px 0;color:#4b5563;font-size:13px;">Cita: ${new Date(
        invoice.appointment.startAt,
      ).toLocaleString('es-CO')}</p>`
    : ''

  const worker =
    invoice.appointment?.worker
      ? `${invoice.appointment.worker.firstName || ''} ${invoice.appointment.worker.lastName || ''}`.trim()
      : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Factura ${escapeHtml(invoice.number)}</title>
  <style>
    @page { margin: 12mm; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #111827;
      margin: 0;
      padding: 24px;
      max-width: 720px;
    }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 0; }
    .muted { color: #6b7280; font-size: 13px; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #065f46;
      font-size: 12px;
      font-weight: 700;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .totals td { padding: 4px 0; }
    .total-row td { font-size: 18px; font-weight: 800; padding-top: 10px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
    <div>
      <h1>${escapeHtml(biz)}</h1>
      ${addr ? `<p class="muted">${escapeHtml(addr)}</p>` : ''}
      ${business?.phone ? `<p class="muted">${escapeHtml(business.phone)}</p>` : ''}
    </div>
    <div style="text-align:right;">
      <h2>${escapeHtml(invoice.number)}</h2>
      <span class="badge">${statusLabel(invoice.status)}</span>
      <p class="muted" style="margin-top:8px;">
        Emitida: ${new Date(invoice.issuedAt).toLocaleString('es-CO')}
      </p>
      ${
        invoice.paidAt
          ? `<p class="muted">Pagada: ${new Date(invoice.paidAt).toLocaleString('es-CO')}</p>`
          : ''
      }
    </div>
  </div>

  <div style="margin-top:24px;padding:12px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
    <p style="margin:0;font-weight:700;">Cliente</p>
    <p style="margin:4px 0;">${escapeHtml(clientName)}</p>
    ${
      invoice.client?.phone
        ? `<p class="muted">${escapeHtml(invoice.client.phone)}</p>`
        : ''
    }
    ${apptLine}
    ${worker ? `<p class="muted">Profesional: ${escapeHtml(worker)}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left;padding-bottom:8px;color:#6b7280;font-size:12px;text-transform:uppercase;">Detalle</th>
        <th style="text-align:right;padding-bottom:8px;color:#6b7280;font-size:12px;text-transform:uppercase;">Importe</th>
      </tr>
    </thead>
    <tbody>
      ${items || `<tr><td colspan="2" class="muted">Sin ítems</td></tr>`}
    </tbody>
  </table>

  <table class="totals" style="margin-top:20px;max-width:280px;margin-left:auto;">
    <tr>
      <td class="muted">Subtotal</td>
      <td style="text-align:right;">${money(invoice.subtotal, currency)}</td>
    </tr>
    <tr>
      <td class="muted">Impuesto</td>
      <td style="text-align:right;">${money(invoice.tax, currency)}</td>
    </tr>
    <tr class="total-row">
      <td>Total</td>
      <td style="text-align:right;">${money(invoice.total, currency)}</td>
    </tr>
  </table>

  ${
    invoice.notes
      ? `<p style="margin-top:24px;font-size:13px;color:#4b5563;"><strong>Notas:</strong> ${escapeHtml(
          invoice.notes,
        )}</p>`
      : ''
  }

  <p class="muted" style="margin-top:32px;text-align:center;">Gracias por su preferencia · ${escapeHtml(biz)}</p>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`

  const win = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900')
  if (!win) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite pop-ups.')
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
