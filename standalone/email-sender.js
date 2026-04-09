const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const config = require('./config');

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
    html: htmlBody
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
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });
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
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    htmlBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'),
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

module.exports = {
  getAuthUrl, getTokensFromCode, getUserInfo,
  sendNow, createDraft, sendEmailSmtp,
  testSmtp, testGmailApi, getOAuthClient
};
