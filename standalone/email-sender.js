const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const crypto = require('crypto');
const config = require('./config');

// ── List-Unsubscribe (RFC 8058) ──
function unsubToken(email) {
  return crypto.createHmac('sha256', config.SESSION_SECRET)
    .update(String(email).toLowerCase()).digest('hex').slice(0, 32);
}

function unsubUrl(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  return config.APP_URL + '/unsubscribe?e=' + e + '&t=' + unsubToken(email);
}

function unsubHeaders(to) {
  const parts = ['<' + unsubUrl(to) + '>'];
  if (config.SMTP_USER) parts.push('<mailto:' + config.SMTP_USER + '?subject=unsubscribe>');
  return parts.join(', ');
}

// ── HTML → plain text (for text/plain MIME part) ──
function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
      const t = text.replace(/<[^>]*>/g, '').trim();
      return href && href !== t ? t + ' (' + href + ')' : t;
    })
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Retry/backoff for transient Gmail API errors (429 / 5xx) ──
async function withRetry(fn, { retries = 3, base = 500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const code = e && (e.code || e.status || (e.response && e.response.status));
      const transient = code === 429 || code === '429' || (typeof code === 'number' && code >= 500);
      if (!transient || attempt >= retries) throw e;
      let delay = base * Math.pow(2, attempt);
      const ra = e.response && e.response.headers && (e.response.headers['retry-after'] || e.response.headers['Retry-After']);
      if (ra) {
        const secs = parseInt(ra, 10);
        if (!isNaN(secs)) delay = secs * 1000;
      }
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
}

let smtpTransport = null;
let oauthClient = null;

// ── SMTP Setup ──
function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  if (!config.SMTP_USER || !config.SMTP_PASS) return null;
  smtpTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS }
  });
  return smtpTransport;
}

// ── Gmail OAuth Setup ──
function getOAuthClient(tokens) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return null;
  const client = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
  if (tokens) client.setCredentials(tokens);
  return client;
}

function getAuthUrl() {
  const client = getOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
}

async function getTokensFromCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

async function getUserInfo(tokens) {
  const client = getOAuthClient(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return data;
}

// ── Send via SMTP ──
async function sendEmailSmtp(to, subject, htmlBody, plainText) {
  const transport = getSmtpTransport();
  if (!transport) throw new Error('SMTP not configured. Set SMTP_USER and SMTP_PASS in .env');
  return transport.sendMail({
    from: config.SMTP_USER,
    to,
    subject,
    text: plainText,
    html: htmlBody,
    list: {
      unsubscribe: [
        { url: unsubUrl(to), comment: 'Unsubscribe' },
        ...(config.SMTP_USER ? [{ url: 'mailto:' + config.SMTP_USER + '?subject=unsubscribe', comment: 'Unsubscribe' }] : [])
      ]
    },
    headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  });
}

// ── Create Draft via Gmail API ──
async function createDraftGmailApi(tokens, to, subject, htmlBody) {
  const client = getOAuthClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const raw = makeRawEmail(tokens.email || config.SMTP_USER, to, subject, htmlBody);
  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw } }
  });
  return res.data;
}

// ── Send via Gmail API ──
async function sendEmailGmailApi(tokens, to, subject, htmlBody) {
  const client = getOAuthClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const raw = makeRawEmail(tokens.email || config.SMTP_USER, to, subject, htmlBody);
  const res = await withRetry(() => gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  }));
  return res.data;
}

// ── Create Draft ──
async function createDraft(tokens, to, subject, htmlBody, plainText) {
  // Method 1: Gmail API — creates actual Gmail draft in Gmail
  if (tokens && config.GOOGLE_CLIENT_ID) {
    try {
      const result = await createDraftGmailApi(tokens, to, subject, htmlBody);
      return { id: result.id, sent: false, draft: true, local: false, to, subject };
    } catch (e) {
      throw new Error('Gmail API draft failed: ' + e.message);
    }
  }
  // Method 2: SMTP mode — save as LOCAL draft (NOT send)
  // User reviews and sends from the app manually
  return { id: 'draft_' + Date.now(), sent: false, draft: true, local: true, to, subject, htmlBody, plainBody: plainText };
}

// ── Send Email (explicit send only) ──
async function sendNow(tokens, to, subject, htmlBody, plainText) {
  if (tokens && config.GOOGLE_CLIENT_ID) {
    return sendEmailGmailApi(tokens, to, subject, htmlBody);
  }
  if (config.SMTP_USER && config.SMTP_PASS) {
    return sendEmailSmtp(to, subject, htmlBody, plainText || '');
  }
  throw new Error('No email method configured.');
}

// ── Build raw RFC 2822 message for Gmail API ──
function makeRawEmail(from, to, subject, htmlBody) {
  const boundary = 'boundary_' + Date.now();
  const lines = [
    'From: ' + from,
    'To: ' + to,
    'Subject: =?UTF-8?B?' + Buffer.from(subject).toString('base64') + '?=',
    'List-Unsubscribe: ' + unsubHeaders(to),
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    htmlToText(htmlBody),
    '',
    '--' + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
    '',
    '--' + boundary + '--'
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

// ── Check connection ──
async function testSmtp() {
  const transport = getSmtpTransport();
  if (!transport) return { ok: false, error: 'SMTP not configured' };
  try {
    await transport.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testGmailApi(tokens) {
  if (!tokens || !config.GOOGLE_CLIENT_ID) return { ok: false, error: 'OAuth not configured' };
  try {
    const client = getOAuthClient(tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const res = await gmail.users.getProfile({ userId: 'me' });
    return { ok: true, email: res.data.emailAddress };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function verifyUnsubToken(email, token) {
  if (!email || !token) return false;
  const expected = unsubToken(email);
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

module.exports = {
  getAuthUrl, getTokensFromCode, getUserInfo,
  sendNow, createDraft, sendEmailSmtp,
  testSmtp, testGmailApi, getOAuthClient,
  verifyUnsubToken, htmlToText, withRetry
};
