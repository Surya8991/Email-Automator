// Wraps a personalized email body in a polished, email-safe container so
// every outgoing message looks consistent — regardless of which template
// authored it. Centralizing this here means we don't have to restyle 60+
// template bodies one by one, and future templates inherit the design.
//
// Email-client safety rules followed here:
//   • Inline styles only (Gmail strips <style> in some contexts).
//   • Tables for outer layout (Outlook on Windows ignores div widths).
//   • System font stack — no @font-face, no external fonts.
//   • Light background only — most recipients use light Gmail/Outlook.
//   • Max width 600 px — the de-facto safe width for desktop and mobile.
//   • No flex / grid — Outlook 2016+ doesn't support them.

interface WrapOpts {
  /** Pre-personalized signature HTML (already escape-safe). */
  signature?: string
  /** Optional preheader — preview text most clients show next to the
   *  subject line. Hidden in the rendered body. */
  preheader?: string
}

export function wrapEmailHtml(bodyHtml: string, opts: WrapOpts = {}): string {
  const signature = (opts.signature ?? '').trim()
  const preheader = (opts.preheader ?? '').trim()

  // Hidden preheader: shows up in the inbox preview line, invisible in
  // the rendered email. The trailing &zwnj; + &nbsp; prevents Gmail from
  // appending the email body to the preheader in the inbox preview.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${escapeAttr(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>`
    : ''

  const signatureBlock = signature
    ? `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;color:#52525b;font-size:14px;line-height:1.55;">${signature}</div>`
    : ''

  // Outer table is the Outlook-safe centering trick. Inner table holds
  // the white card with rounded corners (Outlook ignores the radius — it
  // just sees a square card, which still looks fine).
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;-webkit-font-smoothing:antialiased;text-size-adjust:100%;">
${preheaderHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f4f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;border:1px solid #e4e4e7;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <tr>
          <td style="padding:36px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#18181b;font-size:15px;line-height:1.65;">
            <div class="ea-body">${normalizeBody(bodyHtml)}</div>
            ${signatureBlock}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

// Inject minimal inline polish into common tags inside the body so plain
// <p> / <ul> / <li> templates look intentional without rewriting them.
// Idempotent — re-running on already-wrapped HTML is a no-op for these
// substitutions (only matches bare tags, not ones already styled).
function normalizeBody(html: string): string {
  if (!html) return ''
  return html
    .replace(/<p>/gi, '<p style="margin:0 0 14px 0;">')
    .replace(/<ul>/gi, '<ul style="margin:0 0 14px 22px;padding:0;">')
    .replace(/<ol>/gi, '<ol style="margin:0 0 14px 22px;padding:0;">')
    .replace(/<li>/gi, '<li style="margin:0 0 6px 0;">')
    .replace(/<a\s+href=/gi, '<a style="color:#2563eb;text-decoration:underline;" href=')
    .replace(/<b>/gi, '<strong style="color:#09090b;font-weight:600;">')
    .replace(/<\/b>/gi, '</strong>')
    .replace(/<hr\s*\/?>/gi, '<hr style="border:0;border-top:1px solid #e4e4e7;margin:20px 0;" />')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
