/** Imprime / muestra una gift card visual. */

export type PrintableGiftCard = {
  code: string
  amount: string | number
  balance?: string | number
  expiresAt?: string | null
  recipientName?: string | null
  message?: string | null
}

function money(value: string | number | undefined | null) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Abre una ventana lista para imprimir / compartir la gift card.
 */
export function printGiftCard(
  gift: PrintableGiftCard,
  business?: { name?: string },
) {
  const biz = escapeHtml(business?.name || 'BeautyBook')
  const code = escapeHtml(gift.code)
  const amount = money(gift.amount)
  const to = gift.recipientName
    ? escapeHtml(gift.recipientName.trim())
    : ''
  const message = gift.message
    ? escapeHtml(gift.message.trim())
    : 'Un detalle especial para ti. Disfruta tu experiencia con nosotros.'
  const expires = gift.expiresAt
    ? new Date(gift.expiresAt).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Gift card ${code}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #eef4f1;
      font-family: "DM Sans", system-ui, sans-serif;
      color: #0b1f1c;
    }
    .wrap { width: min(560px, 100%); }
    .card {
      position: relative;
      overflow: hidden;
      border-radius: 28px;
      padding: 36px 32px 28px;
      color: #f7fffb;
      background:
        radial-gradient(ellipse 80% 60% at 10% 0%, rgba(255,255,255,0.22), transparent 55%),
        radial-gradient(ellipse 70% 50% at 100% 100%, rgba(0,0,0,0.18), transparent 50%),
        linear-gradient(135deg, #0f766e 0%, #115e59 42%, #134e4a 100%);
      box-shadow: 0 24px 60px rgba(15, 118, 110, 0.35);
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 14px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.22);
      pointer-events: none;
    }
    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      opacity: 0.85;
      margin: 0 0 10px;
      font-weight: 600;
    }
    .brand {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 34px;
      font-weight: 600;
      margin: 0;
      line-height: 1.1;
    }
    .amount {
      margin: 28px 0 8px;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 52px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .to {
      margin: 0 0 6px;
      font-size: 15px;
      opacity: 0.95;
    }
    .msg {
      margin: 0 0 28px;
      max-width: 36ch;
      font-size: 14px;
      line-height: 1.5;
      opacity: 0.88;
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 18px;
      border-top: 1px solid rgba(255,255,255,0.2);
    }
    .code-label {
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      opacity: 0.7;
      margin: 0 0 6px;
    }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.12em;
      margin: 0;
    }
    .meta {
      text-align: right;
      font-size: 12px;
      opacity: 0.8;
      margin: 0;
    }
    .actions {
      margin-top: 18px;
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    .actions button {
      border: 0;
      border-radius: 999px;
      padding: 12px 22px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .print { background: #0f766e; color: white; }
    .close { background: white; color: #0b1f1c; border: 1px solid #d1d5db !important; }
    @media print {
      body { background: white; padding: 0; }
      .actions { display: none; }
      .card { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="card">
      <p class="eyebrow">Gift card</p>
      <h1 class="brand">${biz}</h1>
      <p class="amount">${amount}</p>
      ${to ? `<p class="to">Para <strong>${to}</strong></p>` : ''}
      <p class="msg">${message}</p>
      <div class="footer">
        <div>
          <p class="code-label">Código</p>
          <p class="code">${code}</p>
        </div>
        <p class="meta">
          ${expires ? `Válida hasta ${escapeHtml(expires)}` : 'Sin vencimiento'}
        </p>
      </div>
    </article>
    <div class="actions">
      <button class="print" onclick="window.print()">Imprimir / PDF</button>
      <button class="close" onclick="window.close()">Cerrar</button>
    </div>
  </div>
</body>
</html>`

  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=820')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
