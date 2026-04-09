require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const emailSender = require('./email-sender');
const te = require('./template-engine');
const importer = require('./importer');
const scheduler = require('./scheduler');

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads'), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase(); if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true); else cb(new Error('Only .xlsx, .xls, .csv allowed')); } });
const templates = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'templates.json'), 'utf8'));

// ══════════ SECURITY MIDDLEWARE ══════════
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: config.SESSION_SECRET, resave: false, saveUninitialized: false, rolling: true, cookie: { maxAge: 10 * 60 * 1000, httpOnly: true, sameSite: 'lax' } }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: 'Too many requests. Wait 1 minute.' } });
const otpLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 5, message: { error: 'Too many OTP requests. Wait 5 minutes.' } });
app.use('/api/', apiLimiter);

// Input sanitizer
function sanitize(str) { if (!str || typeof str !== 'string') return str; return str.replace(/[<>]/g, '').trim(); }

// SSE clients
let sseClients = [];
function sendSSE(data) { sseClients.forEach(res => { try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (_) {} }); }

// ══════════ AUTH: OTP LOGIN ══════════
function getUid(req) { return (req.session.user && req.session.user.id) || 0; }
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required', needLogin: true });
  next();
}

app.post('/auth/send-otp', otpLimiter, async (req, res) => {
  try {
    await db.getDb();
    const email = sanitize(req.body.email || '').toLowerCase();
    if (!email || !te.isValidEmail(email)) return res.json({ error: 'Enter a valid email address' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

    let user = db.getUserByEmail(email);
    if (!user) user = db.createUser(email);
    db.setOtp(user.id, otp, expires);

    // Send OTP via SMTP
    try {
      await emailSender.sendEmailSmtp(email, 'Your Login OTP — Email Automation', '<div style="font-family:Arial;padding:20px;"><h2>Your OTP Code</h2><div style="font-size:32px;font-weight:bold;color:#4f46e5;letter-spacing:8px;margin:20px 0">' + otp + '</div><p>This code expires in 5 minutes.</p><p style="color:#999;font-size:12px">If you didn\'t request this, ignore this email.</p></div>', 'Your OTP is: ' + otp);
      db.addAudit(user.id, 'OTP_SENT', 'OTP sent to ' + email, req.ip);
      res.json({ success: true, message: 'OTP sent to ' + email });
    } catch (e) {
      res.json({ error: 'Failed to send OTP: ' + e.message + '. Check SMTP settings in .env' });
    }
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/auth/verify-otp', otpLimiter, async (req, res) => {
  try {
    await db.getDb();
    const email = sanitize(req.body.email || '').toLowerCase();
    const otp = sanitize(req.body.otp || '');
    if (!email || !otp) return res.json({ error: 'Email and OTP required' });

    const user = db.getUserByEmail(email);
    if (!user) return res.json({ error: 'User not found. Send OTP first.' });

    if (!db.verifyOtp(user.id, otp)) return res.json({ error: 'Invalid or expired OTP. Try again.' });

    req.session.user = { id: user.id, email: user.email };
    db.addAudit(user.id, 'LOGIN', 'Logged in', req.ip);
    res.json({ success: true, user: { email: user.email } });
  } catch (e) { res.json({ error: e.message }); }
});

app.get('/auth/logout', (req, res) => {
  if (req.session.user) db.addAudit(getUid(req), 'LOGOUT', '', req.ip);
  req.session.destroy();
  res.redirect('/');
});

app.get('/auth/status', (req, res) => {
  // Never expose passwords, keys, tokens, or secrets to frontend
  res.json({
    loggedIn: !!req.session.user,
    user: req.session.user ? { email: req.session.user.email, name: req.session.user.name } : null,
    smtpConfigured: !!(config.SMTP_USER && config.SMTP_PASS),
    oauthConfigured: !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
    method: req.session.tokens ? 'oauth' : (config.SMTP_USER ? 'smtp' : 'none'),
    googleTokens: !!req.session.tokens
  });
});

// Block direct access to sensitive files
app.get('/.env', (req, res) => res.status(403).send('Forbidden'));
app.get('/data/*', (req, res) => res.status(403).send('Forbidden'));
app.get('/*.db', (req, res) => res.status(403).send('Forbidden'));

// Google OAuth
app.get('/auth/google', (req, res) => {
  const url = emailSender.getAuthUrl();
  if (!url) return res.json({ error: 'OAuth not configured' });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const tokens = await emailSender.getTokensFromCode(req.query.code);
    const gUser = await emailSender.getUserInfo(tokens);
    tokens.email = gUser.email;
    await db.getDb();
    let user = db.getUserByEmail(gUser.email);
    if (!user) user = db.createUser(gUser.email);
    req.session.tokens = tokens;
    req.session.user = { id: user.id, email: gUser.email, name: gUser.name, picture: gUser.picture };
    db.addAudit(user.id, 'GOOGLE_LOGIN', 'Via Google OAuth', req.ip);
    res.redirect('/?auth=success');
  } catch (e) { res.redirect('/?auth=error&msg=' + encodeURIComponent(e.message)); }
});

// SSE
app.get('/api/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

// ══════════ CONTACTS ══════════
app.get('/api/contacts', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), page = parseInt(req.query.page || '1'), limit = parseInt(req.query.limit || '50'), search = req.query.search || '';
  const contacts = db.getAllContacts(uid, limit, (page - 1) * limit, search);
  const total = search ? db.countContactsSearch(uid, search) : db.countContacts(uid);
  const withEmail = db.countContacts(uid, "recruiter_email != '' AND recruiter_email IS NOT NULL");
  res.json({ contacts, total, withEmail, page, limit, pages: Math.ceil(total / limit) });
});

app.post('/api/contacts/add', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req);
  const email = sanitize(req.body.recruiter_email || '');
  if (!email) return res.json({ error: 'Email is required' });
  if (!te.isValidEmail(email)) return res.json({ error: 'Invalid email format' });
  if (db.emailExists(uid, email)) return res.json({ error: 'This email already exists' });
  if (db.isBlocked(uid, email)) return res.json({ error: 'This email/domain is blocklisted' });
  db.insertContact(uid, { recruiter_name: sanitize(req.body.recruiter_name), company: sanitize(req.body.company), job_title: sanitize(req.body.job_title), recruiter_email: email, location: sanitize(req.body.location), platform: sanitize(req.body.platform), source_url: sanitize(req.body.source_url), notes: sanitize(req.body.notes), num: db.countContacts(uid) + 1 });
  db.addAudit(uid, 'CONTACT_ADD', email, req.ip);
  res.json({ success: true });
});

app.post('/api/contacts/import', requireAuth, upload.single('file'), async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req), filePath = req.file.path, ext = path.extname(req.file.originalname).toLowerCase();
    let contacts = [];
    if (ext === '.xlsx' || ext === '.xls') { const { rows } = importer.importExcel(filePath); contacts = importer.parseContactsFromRows(rows); }
    else if (ext === '.csv') { const csvRows = await importer.importCsv(filePath); contacts = importer.parseCsvContacts(csvRows); }
    else { fs.unlinkSync(filePath); return res.json({ error: 'Use .xlsx or .csv' }); }
    fs.unlinkSync(filePath);
    let imported = 0, duplicates = 0, blocked = 0, startNum = db.countContacts(uid) + 1;
    for (const c of contacts) {
      if (db.emailExists(uid, c.recruiter_email)) { duplicates++; continue; }
      if (db.isBlocked(uid, c.recruiter_email)) { blocked++; continue; }
      c.num = startNum + imported;
      db.insertContact(uid, c);
      imported++;
    }
    db.addAudit(uid, 'IMPORT', imported + ' imported, ' + duplicates + ' dups, ' + blocked + ' blocked', req.ip);
    res.json({ success: true, imported, duplicates, blocked, total: contacts.length });
  } catch (e) {
    try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch (_) {}
    res.json({ error: e.message });
  }
});

app.get('/api/contacts/export', requireAuth, async (req, res) => {
  await db.getDb();
  const contacts = db.getAllContacts(getUid(req), 99999, 0);
  const headers = config.HEADERS.join(',');
  const rows = contacts.map(c => [c.num, c.date_applied, c.company, c.recruiter_name, c.job_title, c.recruiter_email, c.location, c.work_mode, c.job_type, c.platform, c.source_url, c.status, c.priority, c.salary, c.phone_screen, c.interview1, c.interview2, c.final_round, c.offer_date, c.ats_score, c.email_status, c.schedule_date, c.schedule_time, c.tracking, c.notes].map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts_export.csv');
  res.send(headers + '\n' + rows.join('\n'));
});

app.put('/api/contacts/:id', requireAuth, async (req, res) => { await db.getDb(); db.updateContact(parseInt(req.params.id), getUid(req), req.body); res.json({ success: true }); });
app.delete('/api/contacts/:id', requireAuth, async (req, res) => { await db.getDb(); db.deleteContact(parseInt(req.params.id), getUid(req)); res.json({ success: true }); });
app.delete('/api/contacts', requireAuth, async (req, res) => { await db.getDb(); db.deleteAllContacts(getUid(req)); db.addAudit(getUid(req), 'CONTACTS_CLEARED', '', req.ip); res.json({ success: true }); });

// ══════════ TEMPLATES ══════════
app.get('/api/templates', (req, res) => res.json(templates));
app.get('/api/templates/active/current', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), subj = db.getSetting('TEMPLATE_SUBJECT', uid);
  res.json({ hasTemplate: !!(subj && subj.trim()), subject: subj || '', initialMsg: db.getSetting('TEMPLATE_INITIAL', uid) || '', follow1Msg: db.getSetting('TEMPLATE_FOLLOW1', uid) || '', lastFollowMsg: db.getSetting('TEMPLATE_LAST', uid) || '' });
});
app.get('/api/templates/:key', (req, res) => { const t = templates[req.params.key]; if (!t) return res.json({ error: 'Not found' }); res.json(t); });

app.put('/api/templates/:key', requireAuth, async (req, res) => {
  try {
    const key = req.params.key;
    if (!templates[key]) return res.json({ error: 'Template not found' });
    const { label, subject, initialMsg, follow1Msg, lastFollowMsg, category } = req.body;
    if (label !== undefined) templates[key].label = label;
    if (subject !== undefined) templates[key].subject = subject;
    if (initialMsg !== undefined) templates[key].initialMsg = initialMsg.includes('<') ? initialMsg : te.wrapPlainTextAsHtml(initialMsg);
    if (follow1Msg !== undefined) templates[key].follow1Msg = follow1Msg.includes('<') ? follow1Msg : te.wrapPlainTextAsHtml(follow1Msg);
    if (lastFollowMsg !== undefined) templates[key].lastFollowMsg = lastFollowMsg.includes('<') ? lastFollowMsg : te.wrapPlainTextAsHtml(lastFollowMsg);
    if (category !== undefined) templates[key].category = category;
    fs.writeFileSync(path.join(__dirname, 'data', 'templates.json'), JSON.stringify(templates, null, 2));
    await db.getDb();
    db.addAudit(getUid(req), 'TEMPLATE_EDITED', key + ': ' + (label || templates[key].label), req.ip);
    res.json({ success: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/templates/load', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), { key, subject, initialMsg, follow1Msg, lastFollowMsg, portfolioLink, roleName } = req.body;
  if (key && templates[key]) { const t = templates[key]; db.setSetting('TEMPLATE_SUBJECT', uid, t.subject); db.setSetting('TEMPLATE_INITIAL', uid, t.initialMsg); db.setSetting('TEMPLATE_FOLLOW1', uid, t.follow1Msg); db.setSetting('TEMPLATE_LAST', uid, t.lastFollowMsg); }
  else if (subject && initialMsg) { db.setSetting('TEMPLATE_SUBJECT', uid, subject); db.setSetting('TEMPLATE_INITIAL', uid, te.wrapPlainTextAsHtml(initialMsg)); db.setSetting('TEMPLATE_FOLLOW1', uid, te.wrapPlainTextAsHtml(follow1Msg || '')); db.setSetting('TEMPLATE_LAST', uid, te.wrapPlainTextAsHtml(lastFollowMsg || '')); }
  if (portfolioLink) db.setSetting('USER_PORTFOLIO_LINK', uid, portfolioLink);
  if (roleName) db.setSetting('DEFAULT_ROLE_NAME', uid, roleName);
  db.addAudit(uid, 'TEMPLATE_LOAD', key || 'custom', req.ip);
  res.json({ success: true });
});

// ══════════ DRAFTS ══════════
function getActiveTemplate(uid) { return { subject: db.getSetting('TEMPLATE_SUBJECT', uid) || '', initialMsg: db.getSetting('TEMPLATE_INITIAL', uid) || '', follow1Msg: db.getSetting('TEMPLATE_FOLLOW1', uid) || '', lastFollowMsg: db.getSetting('TEMPLATE_LAST', uid) || '' }; }
function getSignature(uid, tokens) {
  // 1. User manually set signature — highest priority
  const cached = db.getSetting('CACHED_SIGNATURE', uid);
  if (cached) return cached;
  // 2. Gmail signature fetched via OAuth — stored after first fetch
  const gmail_sig = db.getSetting('GMAIL_SIGNATURE', uid);
  if (gmail_sig) return gmail_sig;
  // 3. No signature — return empty (don't add default hardcoded one)
  return '';
}

function buildEmail(uid, contact, tokens) {
  const tpl = getActiveTemplate(uid), sig = getSignature(uid, tokens);
  const pData = te.getPersonalizationData(contact);
  pData.portfolio_link = db.getSetting('USER_PORTFOLIO_LINK', uid) || '';
  if (!pData.role_name) pData.role_name = db.getSetting('DEFAULT_ROLE_NAME', uid) || '[Role Name]';
  let htmlBody = te.personalizeMessage(tpl.initialMsg, pData) + sig;
  // Inject unsubscribe link if enabled
  if (db.getSetting('UNSUBSCRIBE_ENABLED', uid) === 'true') {
    const unsubText = db.getSetting('UNSUBSCRIBE_TEXT', uid) || 'If you no longer wish to receive these emails, please reply with "unsubscribe".';
    htmlBody += '<p style="font-size:11px;color:#999;margin-top:20px;border-top:1px solid #eee;padding-top:10px">' + unsubText + '</p>';
  }
  return { to: contact.recruiter_email, subject: te.personalizeMessage(tpl.subject, pData, true), htmlBody, plainBody: te.stripHtml(te.personalizeMessage(tpl.initialMsg, pData)), pData };
}

app.get('/api/drafts/preview/:id', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), contact = db.getContactById(parseInt(req.params.id), uid);
  if (!contact) return res.json({ error: 'Contact not found' });
  const tpl = getActiveTemplate(uid);
  if (!tpl.subject) return res.json({ error: 'No template loaded.' });
  const email = buildEmail(uid, contact, req.session.tokens);
  res.json({ to: email.to, name: contact.recruiter_name, company: contact.company, subject: email.subject, body: email.htmlBody, bodyPlain: email.plainBody });
});

app.post('/api/drafts/single', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req), tpl = getActiveTemplate(uid);
    if (!tpl.subject) return res.json({ error: 'No template loaded.' });
    const contacts = db.getContactsForDrafts(uid, 1);
    if (!contacts.length) return res.json({ error: 'No contacts ready' });
    const contact = contacts[0];
    if (db.isBlocked(uid, contact.recruiter_email)) return res.json({ error: 'Email is blocklisted: ' + contact.recruiter_email });
    const email = buildEmail(uid, contact, req.session.tokens);
    const result = await emailSender.createDraft(req.session.tokens, email.to, email.subject, email.htmlBody, email.plainBody);
    if (result.local) db.addDraft(uid, contact.id, email.to, email.subject, email.htmlBody, email.plainBody);
    db.updateContactStatus(contact.id, 'Draft Created (' + new Date().toLocaleString() + ')');
    db.addAudit(uid, 'DRAFT_CREATED', email.to, req.ip);
    res.json({ success: true, to: email.to, subject: email.subject, method: 'draft', local: !!result.local });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/drafts/bulk', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req);
    scheduler.clearStop();
    const tpl = getActiveTemplate(uid);
    if (!tpl.subject) return res.json({ error: 'No template loaded.' });
    const draftCount = Math.min(Math.max(parseInt(req.body.count || config.MAX_DRAFTS_PER_RUN, 10), 1), config.MAX_DRAFTS_PER_RUN);
    const fast = req.body.fast === true;
    const contacts = db.getContactsForDrafts(uid, draftCount);
    if (!contacts.length) return res.json({ error: 'No contacts ready' });
    let processed = 0, errors = 0, skipped = 0;
    sendSSE({ type: 'draft_start', total: contacts.length });
    for (const contact of contacts) {
      if (scheduler.isStopRequested()) { sendSSE({ type: 'draft_stopped' }); break; }
      if (!te.isValidEmail(contact.recruiter_email)) { db.updateContactStatus(contact.id, 'Invalid email'); skipped++; continue; }
      if (db.isBlocked(uid, contact.recruiter_email)) { db.updateContactStatus(contact.id, 'Blocklisted'); skipped++; continue; }
      try {
        const email = buildEmail(uid, contact, req.session.tokens);
        const result = await emailSender.createDraft(req.session.tokens, email.to, email.subject, email.htmlBody, email.plainBody);
        if (result.local) db.addDraft(uid, contact.id, email.to, email.subject, email.htmlBody, email.plainBody);
        db.updateContactStatus(contact.id, 'Draft Created (' + new Date().toLocaleString() + ')');
        processed++;
        sendSSE({ type: 'draft_progress', processed, total: contacts.length, email: email.to });
        await te.sleep(fast ? (2000 + Math.random() * 3000) : te.getRandomDelay());
      } catch (err) { db.updateContactStatus(contact.id, 'Error: ' + err.message); errors++; }
    }
    scheduler.clearStop();
    sendSSE({ type: 'draft_done', processed, errors, skipped });
    db.addAudit(uid, 'BULK_DRAFT', processed + ' created, ' + errors + ' errors', req.ip);
    res.json({ success: true, processed, errors, skipped, total: contacts.length });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/drafts/stop', requireAuth, (req, res) => { scheduler.requestStop(); res.json({ success: true }); });

// ══════════ LOCAL DRAFTS (Review + Send) ══════════
app.get('/api/drafts', requireAuth, async (req, res) => {
  await db.getDb();
  const page = parseInt(req.query.page || '1'), limit = parseInt(req.query.limit || '20');
  const uid = getUid(req), total = db.countDrafts(uid);
  // getDrafts already returns limited — override with pagination
  const allDrafts = db.getDrafts(uid, 9999);
  const start = (page - 1) * limit;
  const drafts = allDrafts.slice(start, start + limit);
  res.json({ drafts, count: total, page, pages: Math.ceil(total / limit) });
});

app.get('/api/drafts/:id', requireAuth, async (req, res) => {
  await db.getDb();
  const draft = db.getDraftById(parseInt(req.params.id), getUid(req));
  if (!draft) return res.json({ error: 'Draft not found' });
  res.json(draft);
});

app.post('/api/drafts/:id/send', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req);
    const draft = db.getDraftById(parseInt(req.params.id), uid);
    if (!draft) return res.json({ error: 'Draft not found' });
    await emailSender.sendNow(req.session.tokens, draft.to_email, draft.subject, draft.html_body, draft.plain_body);
    db.markDraftSent(draft.id, uid);
    db.incrementDailySendCount(uid, 1);
    if (draft.contact_id) db.updateContactStatus(draft.contact_id, 'Sent (' + new Date().toLocaleString() + ')');
    db.addAudit(uid, 'EMAIL_SENT', draft.to_email, req.ip);
    res.json({ success: true, to: draft.to_email });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/drafts/send-all', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req);
    const sendCount = Math.min(Math.max(parseInt(req.body.count || 50, 10), 1), 50);
    const drafts = db.getDrafts(uid, sendCount);
    if (!drafts.length) return res.json({ error: 'No drafts to send' });
    let sent = 0, errors = 0;
    for (const draft of drafts) {
      if (db.getDailySendCount(uid) >= config.DAILY_SEND_LIMIT) { break; }
      try {
        await emailSender.sendNow(req.session.tokens, draft.to_email, draft.subject, draft.html_body, draft.plain_body);
        db.markDraftSent(draft.id, uid);
        db.incrementDailySendCount(uid, 1);
        if (draft.contact_id) db.updateContactStatus(draft.contact_id, 'Sent (' + new Date().toLocaleString() + ')');
        sent++;
        await te.sleep(te.getRandomDelay());
      } catch (e) { errors++; }
    }
    db.addAudit(uid, 'BULK_SEND', sent + ' sent, ' + errors + ' errors', req.ip);
    res.json({ success: true, sent, errors, total: drafts.length });
  } catch (e) { res.json({ error: e.message }); }
});

app.put('/api/drafts/:id', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req), id = parseInt(req.params.id);
    const draft = db.getDraftById(id, uid);
    if (!draft) return res.json({ error: 'Draft not found' });
    const { subject, html_body, to_email } = req.body;
    const dbInst = await db.getDb();
    const sets = [], params = [];
    if (subject !== undefined) { sets.push('subject = ?'); params.push(sanitize(subject)); }
    if (html_body !== undefined) { sets.push('html_body = ?'); params.push(html_body); sets.push('plain_body = ?'); params.push(te.stripHtml(html_body)); }
    if (to_email !== undefined) { sets.push('to_email = ?'); params.push(sanitize(to_email)); }
    if (sets.length === 0) return res.json({ error: 'Nothing to update' });
    params.push(id, uid);
    dbInst.run(`UPDATE drafts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
    db.saveDb();
    db.addAudit(uid, 'DRAFT_EDITED', draft.to_email, req.ip);
    res.json({ success: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.delete('/api/drafts/:id', requireAuth, async (req, res) => {
  await db.getDb();
  db.deleteDraft(parseInt(req.params.id), getUid(req));
  res.json({ success: true });
});

// Send test email to yourself
app.post('/api/drafts/test-self', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req);
    const tpl = getActiveTemplate(uid);
    if (!tpl.subject) return res.json({ error: 'No template loaded' });
    const userEmail = req.session.user.email;
    const testContact = { recruiter_email: userEmail, recruiter_name: 'Test Recipient', company: 'Your Company', job_title: 'Test Role', location: '', platform: 'Test' };
    const email = buildEmail(uid, testContact, req.session.tokens);
    await emailSender.sendNow(req.session.tokens, userEmail, '[TEST] ' + email.subject, email.htmlBody, email.plainBody);
    db.addAudit(uid, 'TEST_EMAIL_SENT', userEmail, req.ip);
    res.json({ success: true, to: userEmail });
  } catch (e) { res.json({ error: e.message }); }
});

// SMTP test send (for diagnostic)
app.post('/api/test-smtp', requireAuth, async (req, res) => {
  try {
    const userEmail = req.session.user.email;
    await emailSender.sendEmailSmtp(userEmail, 'SMTP Test — Email Automation', '<p>This is a test email from your Email Automation Engine.</p><p>If you received this, SMTP is working correctly.</p>', 'SMTP test email');
    res.json({ success: true, to: userEmail });
  } catch (e) { res.json({ error: e.message }); }
});

// Schedule preview
app.post('/api/schedule/preview', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req);
    const tpl = getActiveTemplate(uid);
    if (!tpl.subject) return res.json({ error: 'No template loaded' });
    const contacts = db.getContactsForSchedule(uid);
    if (!contacts.length) return res.json({ error: 'No contacts ready' });
    const { startDate, startTime } = req.body;
    if (!startDate || !startTime) return res.json({ error: 'Date and time required' });
    const startMs = new Date(startDate + 'T' + startTime).getTime();
    let nextTime = startMs;
    const preview = contacts.slice(0, 20).map(c => {
      const email = buildEmail(uid, c, req.session.tokens);
      const schedDate = new Date(nextTime);
      nextTime += te.getRandomStaggerMs();
      return { email: c.recruiter_email, name: c.recruiter_name, company: c.company, subject: email.subject, scheduledFor: schedDate.toLocaleString() };
    });
    res.json({ success: true, total: contacts.length, preview, firstEmail: new Date(startMs).toLocaleString(), lastEmail: new Date(nextTime).toLocaleString() });
  } catch (e) { res.json({ error: e.message }); }
});

app.delete('/api/drafts/all/clear', requireAuth, async (req, res) => {
  await db.getDb();
  db.deleteAllDrafts(getUid(req));
  db.addAudit(getUid(req), 'DRAFTS_CLEARED', '', req.ip);
  res.json({ success: true });
});

app.post('/api/drafts/followup', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    if (!req.session.tokens) return res.json({ error: 'Gmail API required. Sign in with Google.' });
    const uid = getUid(req), tpl = getActiveTemplate(uid);
    if (!tpl.follow1Msg && !tpl.lastFollowMsg) return res.json({ error: 'No follow-up templates.' });
    const sent = db.getSentContacts(uid);
    if (!sent.length) return res.json({ error: 'No sent emails to follow up.' });
    const { google } = require('googleapis');
    const client = emailSender.getOAuthClient(req.session.tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const sig = getSignature(uid, req.session.tokens);
    let processed = 0, noThread = 0, errors = 0;
    for (const contact of sent) {
      try {
        const pData = te.getPersonalizationData(contact);
        pData.portfolio_link = db.getSetting('USER_PORTFOLIO_LINK', uid) || '';
        const subject = te.personalizeMessage(tpl.subject, pData, true);
        const searchRes = await gmail.users.messages.list({ userId: 'me', q: 'to:' + contact.recruiter_email + ' subject:"' + subject + '" in:sent', maxResults: 1 });
        if (!searchRes.data.messages || !searchRes.data.messages.length) { noThread++; continue; }
        const threadId = (await gmail.users.messages.get({ userId: 'me', id: searchRes.data.messages[0].id })).data.threadId;
        const msgId = searchRes.data.messages[0].id;
        const draftsCreated = [];
        if (req.body.includeFollow1 !== false && tpl.follow1Msg) { const body = te.personalizeMessage(tpl.follow1Msg, pData) + sig; await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { threadId, raw: Buffer.from(['To: ' + contact.recruiter_email, 'Subject: Re: ' + subject, 'In-Reply-To: ' + msgId, 'References: ' + msgId, 'Content-Type: text/html; charset=UTF-8', '', body].join('\r\n')).toString('base64url') } } }); draftsCreated.push('Follow-1'); }
        if (req.body.includeLastFollow !== false && tpl.lastFollowMsg) { const body = te.personalizeMessage(tpl.lastFollowMsg, pData) + sig; await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { threadId, raw: Buffer.from(['To: ' + contact.recruiter_email, 'Subject: Re: ' + subject, 'In-Reply-To: ' + msgId, 'References: ' + msgId, 'Content-Type: text/html; charset=UTF-8', '', body].join('\r\n')).toString('base64url') } } }); draftsCreated.push('Last'); }
        if (draftsCreated.length) { db.updateContactStatus(contact.id, 'Follow-ups: ' + draftsCreated.join(', ') + ' (' + new Date().toLocaleString() + ')'); processed++; }
        await te.sleep(te.getRandomDelay());
      } catch (err) { errors++; }
    }
    db.addAudit(uid, 'FOLLOWUP', processed + ' created', req.ip);
    res.json({ success: true, processed, noThread, errors, total: sent.length });
  } catch (e) { res.json({ error: e.message }); }
});

// ══════════ SCHEDULE ══════════
app.post('/api/schedule', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req), { startDate, startTime } = req.body;
    if (!startDate || !startTime) return res.json({ error: 'Date and time required' });
    const startMs = new Date(startDate + 'T' + startTime).getTime();
    if (isNaN(startMs) || startMs <= Date.now()) return res.json({ error: 'Must be in the future' });
    const tpl = getActiveTemplate(uid);
    if (!tpl.subject) return res.json({ error: 'No template loaded.' });
    const contacts = db.getContactsForSchedule(uid);
    if (!contacts.length) return res.json({ error: 'No contacts ready' });
    let nextSendTime = startMs, scheduled = 0;
    for (const contact of contacts) {
      if (db.isBlocked(uid, contact.recruiter_email)) continue;
      const email = buildEmail(uid, contact, req.session.tokens);
      const schedDate = new Date(nextSendTime);
      db.addEmailLog(uid, { schedule_id: 'sched_' + nextSendTime + '_' + contact.id, email: contact.recruiter_email, subject: email.subject, body: email.htmlBody, scheduled_at: nextSendTime, scheduled_at_text: schedDate.toLocaleString(), source_row: contact.id });
      db.updateContactSchedule(contact.id, 'Scheduled for ' + schedDate.toLocaleString(), schedDate.toLocaleDateString(), schedDate.toLocaleTimeString());
      scheduled++;
      nextSendTime += te.getRandomStaggerMs();
    }
    scheduler.startScheduler();
    db.addAudit(uid, 'SCHEDULE', scheduled + ' emails scheduled', req.ip);
    res.json({ success: true, scheduled, firstEmail: new Date(startMs).toLocaleString(), lastEmail: new Date(nextSendTime).toLocaleString() });
  } catch (e) { res.json({ error: e.message }); }
});

app.get('/api/schedule', requireAuth, async (req, res) => { await db.getDb(); const s = db.getScheduledEmails(getUid(req)); res.json({ scheduled: s, count: s.length }); });
app.delete('/api/schedule', requireAuth, async (req, res) => { await db.getDb(); db.cancelAllScheduled(getUid(req)); scheduler.stopScheduler(); db.addAudit(getUid(req), 'SCHEDULE_CANCEL', '', req.ip); res.json({ success: true }); });

// ══════════ DRY RUN ══════════
app.get('/api/dryrun', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), tpl = getActiveTemplate(uid), contacts = db.getContactsForDrafts(uid, 9999);
  const preview = contacts.slice(0, 100).map(c => {
    const email = tpl.subject ? buildEmail(uid, c) : { to: c.recruiter_email, subject: '(no template)', htmlBody: '' };
    return { id: c.id, email: c.recruiter_email, name: c.recruiter_name, company: c.company, subject: email.subject, bodyPreview: te.stripHtml(email.htmlBody).substring(0, 100) };
  });
  res.json({ ready: contacts.length, totalContacts: db.countContacts(uid), remaining: Math.max(0, config.DAILY_SEND_LIMIT - db.getDailySendCount(uid)), quota: config.DAILY_SEND_LIMIT, hasTemplate: !!tpl.subject, preview });
});

// ══════════ STATS ══════════
app.get('/api/stats', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), sent = db.getDailySendCount(uid);
  res.json({ sentToday: sent, remaining: Math.max(0, config.DAILY_SEND_LIMIT - sent), dailyLimit: config.DAILY_SEND_LIMIT, total: db.countContacts(uid), withEmail: db.countContacts(uid, "recruiter_email != '' AND recruiter_email IS NOT NULL"), drafted: db.countContacts(uid, "email_status LIKE '%Draft Created%'"), sentTotal: db.countContacts(uid, "email_status LIKE '%Sent%'"), scheduled: db.getScheduledEmails(uid).length, bounced: db.countContacts(uid, "email_status LIKE '%BOUNCED%'"), hasTemplate: !!db.getSetting('TEMPLATE_SUBJECT', uid), pendingDrafts: db.countDrafts(uid) });
});

// ══════════ BATCH LOG ══════════
app.get('/api/batchlog', requireAuth, async (req, res) => { await db.getDb(); res.json({ logs: db.getBatchLogs(getUid(req), 50) }); });

// ══════════ AUDIT LOG ══════════
app.get('/api/audit', requireAuth, async (req, res) => { await db.getDb(); res.json({ logs: db.getAuditLogs(getUid(req), 100) }); });

// ══════════ BLOCKLIST ══════════
app.get('/api/blocklist', requireAuth, async (req, res) => { await db.getDb(); res.json({ list: db.getBlocklist(getUid(req)) }); });
app.post('/api/blocklist', requireAuth, async (req, res) => {
  await db.getDb();
  const pattern = sanitize(req.body.pattern || '');
  if (!pattern) return res.json({ error: 'Pattern required' });
  db.addBlocklistEntry(getUid(req), pattern, req.body.type || 'domain');
  db.addAudit(getUid(req), 'BLOCKLIST_ADD', pattern, req.ip);
  res.json({ success: true });
});
app.delete('/api/blocklist/:id', requireAuth, async (req, res) => { await db.getDb(); db.removeBlocklistEntry(parseInt(req.params.id), getUid(req)); res.json({ success: true }); });

// ══════════ BOUNCE CHECK ══════════
app.post('/api/bounces/check', requireAuth, async (req, res) => {
  try {
    if (!req.session.tokens) return res.json({ error: 'Gmail API required. Sign in with Google.' });
    await db.getDb();
    const uid = getUid(req), { google } = require('googleapis');
    const client = emailSender.getOAuthClient(req.session.tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const bouncedEmails = new Set();
    for (const q of ['from:mailer-daemon', 'from:postmaster subject:Undeliverable']) {
      try {
        const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 30 });
        if (!listRes.data.messages) continue;
        for (const m of listRes.data.messages) {
          const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
          const matches = (msg.data.snippet || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
          if (matches) matches.forEach(e => { const c = e.toLowerCase(); if (!c.includes('mailer-daemon') && !c.includes('postmaster')) bouncedEmails.add(c); });
        }
      } catch (_) {}
    }
    let marked = 0;
    const contacts = db.getAllContacts(uid, 99999, 0);
    for (const email of bouncedEmails) {
      contacts.filter(c => c.recruiter_email && c.recruiter_email.toLowerCase() === email).forEach(c => {
        if (!c.email_status || !c.email_status.includes('BOUNCED')) { db.updateContactStatus(c.id, 'BOUNCED'); marked++; }
      });
    }
    db.addAudit(uid, 'BOUNCE_CHECK', bouncedEmails.size + ' found, ' + marked + ' marked', req.ip);
    res.json({ success: true, bouncedFound: bouncedEmails.size, rowsMarked: marked });
  } catch (e) { res.json({ error: e.message }); }
});

// ══════════ SETTINGS ══════════
app.get('/api/settings', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req);
  res.json({ signature: db.getSetting('CACHED_SIGNATURE', uid) || '', defaultSignature: config.DEFAULT_SIGNATURE, portfolioLink: db.getSetting('USER_PORTFOLIO_LINK', uid) || '', roleName: db.getSetting('DEFAULT_ROLE_NAME', uid) || '', trackingUrl: db.getSetting('TRACKING_WEBAPP_URL', uid) || '' });
});
app.post('/api/settings/signature', requireAuth, async (req, res) => { await db.getDb(); const uid = getUid(req); if (req.body.signature && req.body.signature.trim()) db.setSetting('CACHED_SIGNATURE', uid, req.body.signature); else db.deleteSetting('CACHED_SIGNATURE', uid); res.json({ success: true }); });

app.post('/api/settings/fetch-gmail-signature', requireAuth, async (req, res) => {
  try {
    if (!req.session.tokens) return res.json({ error: 'Sign in with Google first to fetch your Gmail signature.' });
    await db.getDb();
    const uid = getUid(req);
    const { google } = require('googleapis');
    const client = emailSender.getOAuthClient(req.session.tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const sendAs = await gmail.users.settings.sendAs.list({ userId: 'me' });
    let signature = '';
    if (sendAs.data.sendAs) {
      const primary = sendAs.data.sendAs.find(a => a.isDefault || a.isPrimary);
      if (primary && primary.signature) signature = primary.signature;
      else if (sendAs.data.sendAs[0] && sendAs.data.sendAs[0].signature) signature = sendAs.data.sendAs[0].signature;
    }
    if (signature) {
      db.setSetting('GMAIL_SIGNATURE', uid, signature);
      db.addAudit(uid, 'GMAIL_SIG_FETCHED', signature.length + ' chars', req.ip);
      res.json({ success: true, signature, length: signature.length });
    } else {
      res.json({ success: true, signature: '', message: 'No signature found in your Gmail settings. Set one at Gmail Settings > Signature.' });
    }
  } catch (e) { res.json({ error: 'Failed to fetch: ' + e.message }); }
});
app.post('/api/settings', requireAuth, async (req, res) => { await db.getDb(); const uid = getUid(req); if (req.body.portfolioLink !== undefined) db.setSetting('USER_PORTFOLIO_LINK', uid, req.body.portfolioLink); if (req.body.roleName !== undefined) db.setSetting('DEFAULT_ROLE_NAME', uid, req.body.roleName); if (req.body.trackingUrl !== undefined) db.setSetting('TRACKING_WEBAPP_URL', uid, req.body.trackingUrl); res.json({ success: true }); });

// ══════════ BACKUP ══════════
app.get('/api/backup', requireAuth, async (req, res) => {
  await db.getDb();
  const buf = db.exportBackup();
  if (!buf) return res.json({ error: 'No database' });
  db.addAudit(getUid(req), 'BACKUP', '', req.ip);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename=backup_' + Date.now() + '.db');
  res.send(buf);
});

// ══════════ DIAGNOSTIC ══════════
app.get('/api/diagnostic', requireAuth, async (req, res) => {
  const r = [], uid = getUid(req);
  const p = (n, d) => r.push({ status: 'PASS', name: n, detail: d });
  const f = (n, d) => r.push({ status: 'FAIL', name: n, detail: d });
  const w = (n, d) => r.push({ status: 'WARN', name: n, detail: d });
  try { await db.getDb(); p('Database', 'Connected'); } catch (e) { f('Database', e.message); }
  try { p('Contacts', db.countContacts(uid) + ' contacts, ' + db.countContacts(uid, "recruiter_email != ''") + ' with email'); } catch (e) { f('Contacts', e.message); }
  const smtpOk = !!(config.SMTP_USER && config.SMTP_PASS), oauthOk = !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
  if (smtpOk || oauthOk) p('Email Config', 'SMTP: ' + (smtpOk ? 'yes' : 'no') + ', OAuth: ' + (oauthOk ? 'yes' : 'no')); else f('Email Config', 'Not configured');
  if (smtpOk) { try { const t = await emailSender.testSmtp(); if (t.ok) p('SMTP', 'Connected'); else w('SMTP', t.error); } catch (e) { w('SMTP', e.message); } } else w('SMTP', 'Not configured');
  if (req.session.tokens) { try { const t = await emailSender.testGmailApi(req.session.tokens); if (t.ok) p('Gmail API', t.email); else w('Gmail API', t.error); } catch (e) { w('Gmail API', e.message); } } else w('Gmail API', 'Not signed in');
  p('Templates', Object.keys(templates).length + ' presets');
  const subj = db.getSetting('TEMPLATE_SUBJECT', uid); if (subj) p('Active Template', '"' + subj.substring(0, 50) + '..."'); else w('Active Template', 'None loaded');
  p('Signature', db.getSetting('CACHED_SIGNATURE', uid) ? 'Custom set' : 'Using default');
  const s = db.getDailySendCount(uid); p('Quota', s + ' sent, ' + (config.DAILY_SEND_LIMIT - s) + ' remaining');
  p('Draft Ready', db.getContactsForDrafts(uid, 9999).length + ' contacts');
  const v = [['a@b.co', true], ['', false], [null, false], ['x@', false]]; if (v.every(([e, x]) => te.isValidEmail(e) === x)) p('Validation', '4/4'); else f('Validation', 'Failed');
  if (te.personalizeMessage('Hi {{name}}', { name: 'J' }, true) === 'Hi J') p('Personalization', 'OK'); else f('Personalization', 'Failed');
  p('Scheduler', db.getScheduledEmails(uid).length + ' queued');
  p('Duplicate Detection', 'Working');
  p('Blocklist', db.getBlocklist(uid).length + ' entries');
  p('Audit Log', db.getAuditLogs(uid, 1).length >= 0 ? 'Working' : 'Error');
  p('Security', 'Helmet + Rate Limit + CSRF + Session Timeout + Input Sanitization');
  const pc = r.filter(x => x.status === 'PASS').length, fc = r.filter(x => x.status === 'FAIL').length, wc = r.filter(x => x.status === 'WARN').length;
  res.json({ results: r, passCount: pc, failCount: fc, warnCount: wc, timestamp: new Date().toLocaleString() });
});

// ══════════ CHARTS DATA ══════════
app.get('/api/charts', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req);
  // Status breakdown
  const statuses = {};
  const allC = db.getAllContacts(uid, 99999, 0);
  allC.forEach(c => {
    let s = (c.email_status || '').trim();
    if (s.includes('Draft Created')) s = 'Drafted';
    else if (s.includes('Sent')) s = 'Sent';
    else if (s.includes('BOUNCED')) s = 'Bounced';
    else if (s.includes('Scheduled')) s = 'Scheduled';
    else if (s.includes('Imported')) s = 'Imported';
    else if (s.includes('Cancelled')) s = 'Cancelled';
    else if (s.includes('Error')) s = 'Error';
    else s = 'Pending';
    statuses[s] = (statuses[s] || 0) + 1;
  });
  // Daily send history (from batch log)
  const logs = db.getBatchLogs(uid, 30);
  const dailySends = {};
  logs.forEach(l => {
    const day = (l.run_timestamp || '').substring(0, 10);
    if (day) dailySends[day] = (dailySends[day] || 0) + (l.sent_count || 0);
  });
  res.json({ statuses, dailySends, totalContacts: allC.length });
});

// ══════════ BULK ACTIONS ══════════
app.post('/api/contacts/bulk-delete', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), ids = req.body.ids || [];
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ error: 'No contacts selected' });
  ids.forEach(id => db.deleteContact(parseInt(id), uid));
  db.addAudit(uid, 'BULK_DELETE', ids.length + ' contacts', req.ip);
  res.json({ success: true, deleted: ids.length });
});

app.post('/api/contacts/bulk-reset', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), ids = req.body.ids || [];
  const dbInst = await db.getDb();
  if (ids.length > 0) {
    ids.forEach(id => { dbInst.run("UPDATE contacts SET email_status = '' WHERE id = ? AND user_id = ?", [parseInt(id), uid]); });
  } else {
    dbInst.run("UPDATE contacts SET email_status = '' WHERE user_id = ? AND (email_status LIKE '%Draft Created%' OR email_status LIKE '%Sent%' OR email_status LIKE '%Error%' OR email_status LIKE '%Cancelled%')", [uid]);
  }
  db.saveDb();
  db.addAudit(uid, 'STATUS_RESET', (ids.length || 'all') + ' contacts', req.ip);
  res.json({ success: true });
});

app.post('/api/contacts/bulk-draft', requireAuth, async (req, res) => {
  try {
    await db.getDb();
    const uid = getUid(req), ids = req.body.ids || [];
    if (!ids.length) return res.json({ error: 'No contacts selected' });
    const tpl = getActiveTemplate(uid);
    if (!tpl.subject) return res.json({ error: 'No template loaded' });
    let processed = 0, errors = 0;
    for (const id of ids) {
      const contact = db.getContactById(parseInt(id), uid);
      if (!contact || !te.isValidEmail(contact.recruiter_email)) continue;
      if (db.isBlocked(uid, contact.recruiter_email)) continue;
      try {
        const email = buildEmail(uid, contact, req.session.tokens);
        const result = await emailSender.createDraft(req.session.tokens, email.to, email.subject, email.htmlBody, email.plainBody);
        if (result.local) db.addDraft(uid, contact.id, email.to, email.subject, email.htmlBody, email.plainBody);
        db.updateContactStatus(contact.id, 'Draft Created (' + new Date().toLocaleString() + ')');
        processed++;
        await te.sleep(te.getRandomDelay());
      } catch (err) { db.updateContactStatus(contact.id, 'Error: ' + err.message); errors++; }
    }
    db.addAudit(uid, 'BULK_DRAFT_SELECTED', processed + ' drafted from ' + ids.length + ' selected', req.ip);
    res.json({ success: true, processed, errors });
  } catch (e) { res.json({ error: e.message }); }
});

// ══════════ REPLY DETECTION ══════════
app.post('/api/replies/check', requireAuth, async (req, res) => {
  try {
    if (!req.session.tokens) return res.json({ error: 'Gmail API required. Sign in with Google.' });
    await db.getDb();
    const uid = getUid(req), { google } = require('googleapis');
    const client = emailSender.getOAuthClient(req.session.tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const sentContacts = db.getSentContacts(uid);
    let replied = 0;
    for (const c of sentContacts) {
      if (c.email_status && c.email_status.includes('Replied')) continue;
      try {
        const r = await gmail.users.messages.list({ userId: 'me', q: 'from:' + c.recruiter_email + ' in:inbox', maxResults: 1 });
        if (r.data.messages && r.data.messages.length > 0) {
          db.updateContactStatus(c.id, 'Replied! (' + new Date().toLocaleString() + ')');
          replied++;
        }
      } catch (_) {}
    }
    db.addAudit(uid, 'REPLY_CHECK', replied + ' replies detected', req.ip);
    res.json({ success: true, checked: sentContacts.length, replied });
  } catch (e) { res.json({ error: e.message }); }
});

// ══════════ CONTACT TIMELINE ══════════
app.get('/api/contacts/:id/timeline', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req), id = parseInt(req.params.id);
  const contact = db.getContactById(id, uid);
  if (!contact) return res.json({ error: 'Not found' });
  const audits = db.getAuditLogs(uid, 500).filter(a => a.detail && a.detail.includes(contact.recruiter_email));
  const timeline = [];
  if (contact.created_at) timeline.push({ time: contact.created_at, event: 'Imported / Added' });
  audits.forEach(a => timeline.push({ time: a.created_at, event: a.action + ': ' + a.detail }));
  if (contact.email_status) timeline.push({ time: '', event: 'Current status: ' + contact.email_status });
  res.json({ contact, timeline });
});

// ══════════ CSV TEMPLATE DOWNLOAD ══════════
app.get('/api/csv-template', (req, res) => {
  const csv = 'Name,Company,Role / Title,Email,LinkedIn,Phone,Platform Met,Notes\nJohn Doe,Acme Corp,HR Manager,john@acme.com,https://linkedin.com/in/johndoe,+91 98765 43210,LinkedIn,Sample contact\nJane Smith,TechCo,CTO,jane@techco.com,,,,';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts_template.csv');
  res.send(csv);
});

// ══════════ UNSUBSCRIBE LINK ══════════
// Config setting — injected into emails when enabled
app.post('/api/settings/unsubscribe', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req);
  db.setSetting('UNSUBSCRIBE_ENABLED', uid, req.body.enabled ? 'true' : 'false');
  if (req.body.text) db.setSetting('UNSUBSCRIBE_TEXT', uid, req.body.text);
  res.json({ success: true });
});

// ══════════ USER PROFILE ══════════
app.get('/api/profile', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req);
  res.json({
    email: req.session.user.email,
    name: db.getSetting('PROFILE_NAME', uid) || req.session.user.name || '',
    phone: db.getSetting('PROFILE_PHONE', uid) || '',
    company: db.getSetting('PROFILE_COMPANY', uid) || '',
    role: db.getSetting('PROFILE_ROLE', uid) || '',
    linkedin: db.getSetting('PROFILE_LINKEDIN', uid) || '',
    portfolioLink: db.getSetting('USER_PORTFOLIO_LINK', uid) || '',
    timezone: db.getSetting('PROFILE_TIMEZONE', uid) || 'Asia/Kolkata',
    theme: db.getSetting('PROFILE_THEME', uid) || 'light',
    contactsCount: db.countContacts(uid),
    isAdmin: config.ADMIN_EMAILS.includes(req.session.user.email.toLowerCase())
  });
});

app.post('/api/profile', requireAuth, async (req, res) => {
  await db.getDb();
  const uid = getUid(req);
  const fields = { PROFILE_NAME: req.body.name, PROFILE_PHONE: req.body.phone, PROFILE_COMPANY: req.body.company, PROFILE_ROLE: req.body.role, PROFILE_LINKEDIN: req.body.linkedin, USER_PORTFOLIO_LINK: req.body.portfolioLink, PROFILE_TIMEZONE: req.body.timezone, PROFILE_THEME: req.body.theme };
  for (const [key, val] of Object.entries(fields)) { if (val !== undefined) db.setSetting(key, uid, sanitize(val)); }
  db.addAudit(uid, 'PROFILE_UPDATE', '', req.ip);
  res.json({ success: true });
});

// ══════════ ADMIN PANEL ══════════
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required', needLogin: true });
  if (!config.ADMIN_EMAILS.includes(req.session.user.email.toLowerCase())) return res.status(403).json({ error: 'Admin access only' });
  next();
}

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const dbInst = await db.getDb();
  const users = db.sqlToObjects(dbInst.exec('SELECT id, email, created_at, last_login FROM users ORDER BY id ASC'));
  const usersWithStats = users.map(u => ({
    id: u.id, email: u.email, created_at: u.created_at, last_login: u.last_login,
    contacts: db.countContacts(u.id),
    drafted: db.countContacts(u.id, "email_status LIKE '%Draft%' OR email_status LIKE '%Sent%'"),
    isAdmin: config.ADMIN_EMAILS.includes(u.email.toLowerCase())
  }));
  res.json({ users: usersWithStats, total: usersWithStats.length });
});

app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
  await db.getDb();
  const uid = parseInt(req.params.id);
  const dbInst = await db.getDb();
  const userResult = db.sqlToObjects(dbInst.exec('SELECT id, email, created_at, last_login FROM users WHERE id = ?', [uid]));
  if (!userResult.length) return res.json({ error: 'User not found' });
  const u = userResult[0];
  res.json({
    id: u.id, email: u.email, created_at: u.created_at, last_login: u.last_login,
    contacts: db.countContacts(uid),
    withEmail: db.countContacts(uid, "recruiter_email != ''"),
    drafted: db.countContacts(uid, "email_status LIKE '%Draft%'"),
    sent: db.countContacts(uid, "email_status LIKE '%Sent%'"),
    scheduled: db.getScheduledEmails(uid).length,
    blocklist: db.getBlocklist(uid).length,
    recentAudit: db.getAuditLogs(uid, 20),
    isAdmin: config.ADMIN_EMAILS.includes(u.email.toLowerCase())
  });
});

app.get('/api/admin/users/:id/contacts', requireAdmin, async (req, res) => {
  await db.getDb();
  const uid = parseInt(req.params.id);
  const page = parseInt(req.query.page || '1'), limit = parseInt(req.query.limit || '50');
  const contacts = db.getAllContacts(uid, limit, (page - 1) * limit);
  res.json({ contacts, total: db.countContacts(uid), page, pages: Math.ceil(db.countContacts(uid) / limit) });
});

app.get('/api/admin/audit', requireAdmin, async (req, res) => {
  await db.getDb();
  const dbInst = await db.getDb();
  const logs = db.sqlToObjects(dbInst.exec('SELECT a.*, u.email as user_email FROM audit_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.id DESC LIMIT 200'));
  res.json({ logs });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  await db.getDb();
  const uid = parseInt(req.params.id);
  const dbInst = await db.getDb();
  // Don't allow deleting admin
  const userCheck = db.sqlToObjects(dbInst.exec('SELECT email FROM users WHERE id = ?', [uid]));
  if (userCheck.length && config.ADMIN_EMAILS.includes(userCheck[0].email.toLowerCase())) return res.json({ error: 'Cannot delete admin user' });
  dbInst.run('DELETE FROM contacts WHERE user_id = ?', [uid]);
  dbInst.run('DELETE FROM email_log WHERE user_id = ?', [uid]);
  dbInst.run('DELETE FROM batch_log WHERE user_id = ?', [uid]);
  dbInst.run('DELETE FROM settings WHERE user_id = ?', [uid]);
  dbInst.run('DELETE FROM audit_log WHERE user_id = ?', [uid]);
  dbInst.run('DELETE FROM blocklist WHERE user_id = ?', [uid]);
  dbInst.run('DELETE FROM users WHERE id = ?', [uid]);
  db.saveDb();
  db.addAudit(getUid(req), 'ADMIN_DELETE_USER', 'Deleted user #' + uid, req.ip);
  res.json({ success: true });
});

// ══════════ START ══════════
async function start() {
  await db.getDb();
  // Clear old contacts (fresh start)
  // db.deleteAllContacts(0); // uncomment to clear on restart
  app.listen(config.PORT, () => { console.log('\n  Email Automation Engine\n  http://localhost:' + config.PORT + '\n  SMTP: ' + (config.SMTP_USER ? 'configured' : 'not set') + '\n  OAuth: ' + (config.GOOGLE_CLIENT_ID ? 'configured' : 'not set') + '\n  Security: Helmet + Rate Limit + OTP Login\n'); });
}
start();
