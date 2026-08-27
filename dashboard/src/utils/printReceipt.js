import { formatMoney } from '@shared/format-money';
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Merge duplicate items (same name + notes) by summing quantities.
function mergeItems(items, nameKey = 'name') {
  const map = {};
  const result = [];
  for (const item of items) {
    const k = `${item[nameKey] || item.name || ''}|${item.notes || ''}`;
    if (map[k] !== undefined) {
      result[map[k]] = { ...result[map[k]], quantity: result[map[k]].quantity + item.quantity };
    } else {
      map[k] = result.length;
      result.push({ ...item });
    }
  }
  return result;
}

function methodLabel(m) {
  if (!m) return '';
  return m.split('+').map((p) => {
    const t = p.trim().toLowerCase();
    if (t === 'mobile') return 'UPI';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }).join(' + ');
}

// Returns one or more <tr> elements for the payment section of the receipt.
function buildPaymentRows(receipt, fmt) {
  const detail = receipt.payments_detail;

  if (!detail || detail.length === 0) {
    return `<tr><td class="lbl">Payment</td><td style="text-align:right">${esc(methodLabel(receipt.payment_method))}</td></tr>`;
  }

  if (detail.length === 1) {
    const p = detail[0];
    const tenders = p.tenders;
    // Split tender on one bill (e.g. Cash ₹200 + UPI ₹300)
    if (tenders && tenders.length > 1) {
      return tenders.map((t, i) => `
        <tr>
          <td class="lbl">${i === 0 ? 'Payment' : ''}</td>
          <td style="text-align:right">${esc(methodLabel(t.method))}&ensp;<span style="color:#777">${fmt(t.amount)}</span></td>
        </tr>`).join('');
    }
    // Simple single payment — method only, no amount clutter
    return `<tr><td class="lbl">Payment</td><td style="text-align:right">${esc(methodLabel(p.method))}</td></tr>`;
  }

  // Multiple records = split by items — show Bill N + method + amount
  return detail.map((p, i) => `
    <tr>
      <td class="lbl">${i === 0 ? 'Payment' : ''}</td>
      <td style="text-align:right">Bill ${i + 1}&ensp;${esc(methodLabel(p.method))}&ensp;<span style="color:#777">${fmt(p.amount)}</span></td>
    </tr>`).join('');
}

export function printReceipt(receipt, currency, win = null) {
  // Same formatter as the screen this was printed from — a receipt that groups
  // digits differently to the till is the kind of discrepancy that gets argued
  // about at the counter.
  const fmt = (v) => esc(formatMoney(v, currency));

  const date = new Date(receipt.created_at).toLocaleString('en-US', {
    timeZone: receipt.timezone || 'UTC',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const channelLabel = receipt.channel
    ? receipt.channel.charAt(0).toUpperCase() + receipt.channel.slice(1)
    : '';
  const location = receipt.channel === 'dining'
    ? (receipt.table_number ? `Table ${receipt.table_number}` : 'Dine-in')
    : (receipt.customer_ref || channelLabel);

  const itemsHtml = mergeItems(receipt.items || []).map((item) => {
    const custLabels = Object.entries(item.customizations || {})
      .flatMap(([, v]) => Array.isArray(v) ? v : [v]);
    return `<tr>
      <td style="padding:2px 0;vertical-align:top">
        ${esc(item.name)} &times; ${esc(item.quantity)}
        ${custLabels.length > 0 ? `<br><span style="color:#6d28d9;font-size:11px">${custLabels.map(esc).join(', ')}</span>` : ''}
        ${item.notes ? `<br><span style="color:#777;font-size:11px">${esc(item.notes)}</span>` : ''}
      </td>
      <td style="text-align:right;padding:2px 0;vertical-align:top;white-space:nowrap">${fmt(item.price * item.quantity)}</td>
    </tr>`;
  }).join('');

  const discountRow = parseFloat(receipt.discount_amount) > 0
    ? `<tr>
        <td style="color:#15803d">Discount${receipt.discount_type === 'percent' ? ` (${esc(receipt.discount_value)}%)` : ' (flat)'}</td>
        <td style="text-align:right;color:#15803d">&minus;${fmt(receipt.discount_amount)}</td>
      </tr>` : '';

  const couponRow = parseFloat(receipt.coupon_discount_amount) > 0
    ? `<tr>
        <td style="color:#15803d">Coupon discount</td>
        <td style="text-align:right;color:#15803d">&minus;${fmt(receipt.coupon_discount_amount)}</td>
      </tr>` : '';

  const loyaltyRow = parseFloat(receipt.loyalty_discount_amount) > 0
    ? `<tr>
        <td style="color:#15803d">Loyalty redemption</td>
        <td style="text-align:right;color:#15803d">&minus;${fmt(receipt.loyalty_discount_amount)}</td>
      </tr>` : '';

  const taxRow = parseFloat(receipt.tax_rate) > 0
    ? `<tr>
        <td>Tax (${+(parseFloat(receipt.tax_rate) * 100).toFixed(4)}%)</td>
        <td style="text-align:right">${fmt(receipt.tax_amount)}</td>
      </tr>` : '';

  const scRow = parseFloat(receipt.service_charge_rate) > 0
    ? `<tr>
        <td>Service charge (${+(parseFloat(receipt.service_charge_rate) * 100).toFixed(4)}%)</td>
        <td style="text-align:right">${fmt(receipt.service_charge_amount)}</td>
      </tr>` : '';

  const packagingRow = parseFloat(receipt.packaging_fee) > 0
    ? `<tr>
        <td>Packaging fee</td>
        <td style="text-align:right">${fmt(receipt.packaging_fee)}</td>
      </tr>` : '';

  const orderToken = receipt.order_ref || (receipt.order_id || '').slice(-6).toUpperCase();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt #${esc(orderToken)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',Courier,monospace;font-size:13px;width:300px;margin:0 auto;padding:16px 10px;color:#111}
    .c{text-align:center}
    hr{border:none;border-top:1px dashed #999;margin:8px 0}
    table{width:100%;border-collapse:collapse}
    .lbl{color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
    .total-row td{font-size:15px;font-weight:bold;padding-top:6px;border-top:1px solid #111}
    @media print{@page{margin:0;size:80mm auto}body{padding:6px 4px}}
  </style>
</head>
<body>
  <div class="c">
    <strong style="font-size:16px">${esc(receipt.restaurant_name || 'Restaurant')}</strong><br>
    <span class="lbl">Receipt</span>
  </div>
  <hr>
  <table>
    <tr><td class="lbl">Order</td><td style="text-align:right">#${esc(orderToken)}</td></tr>
    <tr><td class="lbl">Date</td><td style="text-align:right;font-size:12px">${esc(date)}</td></tr>
    <tr><td class="lbl">Type</td><td style="text-align:right;text-transform:capitalize">${esc(location)}</td></tr>
    ${buildPaymentRows(receipt, fmt)}
  </table>
  <hr>
  <table>${itemsHtml}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">${fmt(receipt.subtotal)}</td></tr>
    ${discountRow}${couponRow}${loyaltyRow}${taxRow}${scRow}${packagingRow}
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmt(receipt.total_charged)}</td></tr>
  </table>
  <hr>
  <div class="c" style="font-size:12px;color:#555;margin-top:6px">Thank you! Please visit again.</div>
  <script>window.onload = function(){ window.focus(); window.print(); };</script>
</body>
</html>`;

  if (!win) {
    win = window.open('', '_blank', 'width=360,height=700,toolbar=no,menubar=no,scrollbars=yes');
    if (!win) {
      alert('Please allow pop-ups for this site to print receipts.');
      return;
    }
  }
  win.document.write(html);
  win.document.close();
}

function buildKOTBlock(order, restaurantName, timezone = 'UTC') {
  const token    = order.order_ref || (order.id || '').slice(-6).toUpperCase();
  const placed   = new Date(order.created_at);
  const timeStr  = placed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  const dateStr  = placed.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: timezone });

  const location = order.channel === 'dining'
    ? (order.table_number ? `TABLE ${order.table_number}` : 'DINE-IN')
    : (order.customer_ref || (order.channel === 'takeaway' ? 'TAKEAWAY' : 'DELIVERY'));

  const liveItems = mergeItems(
    (order.items || []).filter((i) => i.item_status !== 'cancelled'),
    'item_name',
  );

  const byCategory = liveItems.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categories = Object.keys(byCategory);
  const showHeaders = categories.length > 1 || (categories.length === 1 && categories[0] !== 'Other');

  const categoryBlocks = Object.entries(byCategory).map(([cat, items]) => {
    const rows = items.map((item) => {
      const custLabels = Object.entries(item.customizations || {})
        .flatMap(([, v]) => Array.isArray(v) ? v : [v]);
      return `
        <tr><td style="font-size:15px;font-weight:700;padding:5px 0 1px;vertical-align:top">
          ${esc(item.quantity)}&nbsp;&times;&nbsp;${esc(item.item_name || item.name)}
        </td></tr>
        ${custLabels.length > 0
          ? `<tr><td style="font-size:12px;color:#333;padding:0 0 2px 16px">${custLabels.map(esc).join(', ')}</td></tr>`
          : ''}
        ${item.notes
          ? `<tr><td style="font-size:12px;color:#555;padding:0 0 4px 16px;font-style:italic">&#8618; ${esc(item.notes)}</td></tr>`
          : ''}`;
    }).join('');
    return `
      <div style="margin-bottom:10px">
        ${showHeaders ? `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#777;border-bottom:1px solid #bbb;padding-bottom:3px;margin-bottom:4px">${esc(cat)}</div>` : ''}
        <table style="width:100%;border-collapse:collapse">${rows}</table>
      </div>`;
  }).join('');

  return `
  <div class="c">
    <div style="font-size:13px">${esc(restaurantName)}</div>
    <strong style="font-size:20px;letter-spacing:.12em">KITCHEN ORDER</strong>
  </div>
  <hr>
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="font-size:11px;color:#555;text-transform:uppercase;padding-bottom:4px">Order</td>
      <td style="text-align:right;font-size:18px;font-weight:700">#${esc(token)}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#555;text-transform:uppercase;padding-bottom:4px">Location</td>
      <td style="text-align:right;font-size:18px;font-weight:700">${esc(location)}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#555;text-transform:uppercase">Time</td>
      <td style="text-align:right;font-size:12px">${esc(timeStr)} &middot; ${esc(dateStr)}</td>
    </tr>
  </table>
  <hr>
  ${categoryBlocks}`;
}

// Shared 80mm thermal styles for a single KOT ticket — used by both the manual
// popup print (printKOT) and the silent auto-print (printKOTSilent).
const KOT_SINGLE_STYLE =
  `*{margin:0;padding:0;box-sizing:border-box}` +
  `body{font-family:'Courier New',Courier,monospace;font-size:13px;width:300px;margin:0 auto;padding:16px 10px;color:#111}` +
  `.c{text-align:center}` +
  `hr{border:none;border-top:2px dashed #444;margin:8px 0}` +
  `@media print{@page{margin:0;size:80mm auto}body{padding:6px 4px}}`;

export function printKOT(order) {
  const restaurant = JSON.parse(localStorage.getItem('pos_restaurant') || '{}');
  const restaurantName = restaurant.name || 'Kitchen';
  // Restaurant timezone (set in TimezoneContext) — otherwise the ticket time
  // renders in the print terminal's local zone, which may differ.
  const timezone = localStorage.getItem('pos_timezone') || 'UTC';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KOT #${esc(order.order_ref || (order.id || '').slice(-6).toUpperCase())}</title>
  <style>${KOT_SINGLE_STYLE}</style>
</head>
<body>
  ${buildKOTBlock(order, restaurantName, timezone)}
  <script>window.onload = function(){ window.focus(); window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=360,height=620,toolbar=no,menubar=no,scrollbars=yes');
  if (!win) {
    alert('Please allow pop-ups for this site to print KOTs.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

export function printAllKOTs(orders) {
  if (!orders.length) return;
  const restaurant = JSON.parse(localStorage.getItem('pos_restaurant') || '{}');
  const restaurantName = restaurant.name || 'Kitchen';
  const timezone = localStorage.getItem('pos_timezone') || 'UTC';

  const blocks = orders.map((order) => `
    <div class="kot-page">
      ${buildKOTBlock(order, restaurantName, timezone)}
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>All KOTs (${orders.length})</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',Courier,monospace;font-size:13px;color:#111}
    .c{text-align:center}
    hr{border:none;border-top:2px dashed #444;margin:8px 0}
    .kot-page{width:300px;margin:0 auto;padding:16px 10px;page-break-after:always}
    .kot-page:last-child{page-break-after:avoid}
    @media print{@page{margin:0;size:80mm auto}.kot-page{padding:6px 4px}}
  </style>
</head>
<body>
  ${blocks}
  <script>window.onload = function(){ window.focus(); window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=360,height=700,toolbar=no,menubar=no,scrollbars=yes');
  if (!win) {
    alert('Please allow pop-ups for this site to print KOTs.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

// Auto-print a single KOT without any user gesture. Uses a hidden same-origin
// iframe instead of window.open — a popup would be blocked when fired from a
// WebSocket event (no user gesture). The order is the KOT shape from
// GET /orders/:id/kot.
export function printKOTSilent(order) {
  const restaurant = JSON.parse(localStorage.getItem('pos_restaurant') || '{}');
  const restaurantName = restaurant.name || 'Kitchen';
  const timezone = localStorage.getItem('pos_timezone') || 'UTC';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>KOT</title>` +
    `<style>${KOT_SINGLE_STYLE}</style></head><body>` +
    `${buildKOTBlock(order, restaurantName, timezone)}</body></html>`,
  );
  doc.close();

  let cleaned = false;
  const cleanup = () => { if (!cleaned) { cleaned = true; iframe.remove(); } };
  const win = iframe.contentWindow;
  win.onafterprint = cleanup;

  // Give the iframe a tick to lay out before printing.
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* ignore — printing unavailable */ }
    // Safety net if onafterprint never fires (some browsers/headless).
    setTimeout(cleanup, 60_000);
  }, 150);
}
