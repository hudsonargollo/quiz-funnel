/**
 * Email content templates. Email clients ignore <style>/external CSS and strip
 * custom properties, so everything here is inline, table-based, and uses literal
 * brand values (mirrors tokens.css --brand-500 #00AEEF → #7AD9FF). Keep it simple
 * and bulletproof across Gmail/Outlook/Apple Mail.
 */

const BRAND = '#00AEEF';
const BRAND_SOFT = '#7AD9FF';
const INK = '#0d1117';
const MUTED = '#4a5568';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Convert newlines in user-authored body copy into paragraph breaks (escaped). */
function paras(body) {
  return String(body || '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;color:${MUTED};font-size:15px;line-height:1.6">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Render the lead-magnet deliverable email.
 * @param {object} o - { brandName, firstName, intro, deliverableUrl, buttonLabel }
 * @returns {{subject:string|undefined, html:string, text:string}}
 */
export function renderDeliverable(o = {}) {
  const brandName = o.brandName || 'FunnelsTone';
  const hi = o.firstName ? `Olá, ${esc(o.firstName)}!` : 'Olá!';
  const intro = o.intro || 'Obrigado! Aqui está o material que você pediu — é só clicar no botão abaixo para acessar.';
  const buttonLabel = o.buttonLabel || 'Acessar agora';
  const url = o.deliverableUrl || '';

  const button = url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:12px;background:linear-gradient(135deg,${BRAND},${BRAND_SOFT})">
           <a href="${esc(url)}" target="_blank"
              style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#04161f;text-decoration:none;border-radius:12px">
             ${esc(buttonLabel)} &rarr;
           </a>
         </td></tr>
       </table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:28px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 2px 16px rgba(0,174,239,.08)">
        <tr><td style="height:5px;background:linear-gradient(135deg,${BRAND},${BRAND_SOFT})"></td></tr>
        <tr><td style="padding:34px 34px 12px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${BRAND}">${esc(brandName)}</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${INK}">${hi}</h1>
          ${paras(intro)}
        </td></tr>
        <tr><td style="padding:6px 34px 34px">${button}</td></tr>
        ${url ? `<tr><td style="padding:0 34px 30px">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">Se o botão não funcionar, copie e cole este link no seu navegador:<br>
          <a href="${esc(url)}" style="color:${BRAND};word-break:break-all">${esc(url)}</a></p>
        </td></tr>` : ''}
        <tr><td style="padding:18px 34px;border-top:1px solid #eef1f5">
          <p style="margin:0;font-size:11px;color:#9ca3af">Enviado por ${esc(brandName)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [hi, '', String(intro), '', url ? `${buttonLabel}: ${url}` : '', '', `— ${brandName}`]
    .filter((l) => l !== undefined).join('\n');

  return { subject: o.subject || undefined, html, text };
}

/**
 * Render the "reset your password" email.
 * @param {object} o - { resetUrl, expiresInMinutes }
 * @returns {{subject:string, html:string, text:string}}
 */
export function renderPasswordReset(o = {}) {
  const brandName = 'FunnelsTone';
  const url = o.resetUrl || '';
  const mins = o.expiresInMinutes || 60;
  const expiryLine = mins % 60 === 0 ? `${mins / 60}h` : `${mins} min`;

  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:12px;background:linear-gradient(135deg,${BRAND},${BRAND_SOFT})">
           <a href="${esc(url)}" target="_blank"
              style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#04161f;text-decoration:none;border-radius:12px">
             Redefinir password &rarr;
           </a>
         </td></tr>
       </table>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:28px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 2px 16px rgba(0,174,239,.08)">
        <tr><td style="height:5px;background:linear-gradient(135deg,${BRAND},${BRAND_SOFT})"></td></tr>
        <tr><td style="padding:34px 34px 12px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${BRAND}">${esc(brandName)}</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${INK}">Redefina a sua password</h1>
          <p style="margin:0 0 14px;color:${MUTED};font-size:15px;line-height:1.6">Recebemos um pedido para redefinir a password da sua conta. Clique no botão abaixo para escolher uma nova — o link expira em ${expiryLine}.</p>
        </td></tr>
        <tr><td style="padding:6px 34px 34px">${button}</td></tr>
        <tr><td style="padding:0 34px 30px">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">Se o botão não funcionar, copie e cole este link no seu navegador:<br>
          <a href="${esc(url)}" style="color:${BRAND};word-break:break-all">${esc(url)}</a></p>
        </td></tr>
        <tr><td style="padding:18px 34px;border-top:1px solid #eef1f5">
          <p style="margin:0;font-size:11px;color:#9ca3af">Se não foi você quem pediu isto, pode ignorar este email com segurança — a sua password não será alterada.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    'Redefina a sua password',
    '',
    `Recebemos um pedido para redefinir a password da sua conta. Este link expira em ${expiryLine}:`,
    url,
    '',
    'Se não foi você quem pediu isto, ignore este email — a sua password não será alterada.',
    '',
    `— ${brandName}`,
  ].join('\n');

  return { subject: 'Redefinir a sua password — FunnelsTone', html, text };
}
