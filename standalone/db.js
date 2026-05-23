const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'tracker.db');
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  initSchema();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    otp TEXT DEFAULT '',
    otp_expires INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  // Contacts — per user
  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    num INTEGER,
    date_applied TEXT DEFAULT '',
    company TEXT DEFAULT '',
    recruiter_name TEXT DEFAULT '',
    job_title TEXT DEFAULT '',
    recruiter_email TEXT DEFAULT '',
    location TEXT DEFAULT '',
    work_mode TEXT DEFAULT '',
    job_type TEXT DEFAULT '',
    platform TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    status TEXT DEFAULT 'Not Applied',
    priority TEXT DEFAULT '',
    salary TEXT DEFAULT '',
    phone_screen TEXT DEFAULT '',
    interview1 TEXT DEFAULT '',
    interview2 TEXT DEFAULT '',
    final_round TEXT DEFAULT '',
    offer_date TEXT DEFAULT '',
    ats_score TEXT DEFAULT '',
    email_status TEXT DEFAULT '',
    schedule_date TEXT DEFAULT '',
    schedule_time TEXT DEFAULT '',
    tracking TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    schedule_id TEXT,
    email TEXT,
    subject TEXT,
    body TEXT DEFAULT '',
    scheduled_at INTEGER,
    scheduled_at_text TEXT,
    source_row INTEGER,
    status TEXT DEFAULT 'Scheduled',
    attempts INTEGER DEFAULT 0,
    last_result TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS batch_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    batch_id TEXT,
    run_timestamp TEXT,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    retried_count INTEGER DEFAULT 0,
    attempted_count INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    remaining INTEGER DEFAULT 0,
    note TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    value TEXT,
    PRIMARY KEY (key, user_id)
  )`);

  // Audit log
  db.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Blocklist
  db.run(`CREATE TABLE IF NOT EXISTS blocklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pattern TEXT NOT NULL,
    type TEXT DEFAULT 'domain',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migrations — add user_id to existing tables
  // Local drafts table
  db.run(`CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contact_id INTEGER,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    plain_body TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  try { db.run(`ALTER TABLE contacts ADD COLUMN user_id INTEGER DEFAULT 0`); } catch (_) {}
  try { db.run(`ALTER TABLE email_log ADD COLUMN user_id INTEGER DEFAULT 0`); } catch (_) {}
  try { db.run(`ALTER TABLE email_log ADD COLUMN body TEXT DEFAULT ''`); } catch (_) {}
  try { db.run(`ALTER TABLE batch_log ADD COLUMN user_id INTEGER DEFAULT 0`); } catch (_) {}

  saveDb();
}

function sqlToObjects(result) {
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// ── Users & OTP ──
function getUserByEmail(email) {
  const r = db.exec(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`, [email]);
  const rows = sqlToObjects(r);
  return rows.length ? rows[0] : null;
}

function createUser(email) {
  db.run(`INSERT OR IGNORE INTO users (email) VALUES (?)`, [email.toLowerCase()]);
  saveDb();
  return getUserByEmail(email);
}

function setOtp(userId, otp, expiresMs) {
  db.run(`UPDATE users SET otp = ?, otp_expires = ? WHERE id = ?`, [otp, expiresMs, userId]);
  saveDb();
}

function verifyOtp(userId, otp) {
  const r = db.exec(`SELECT otp, otp_expires FROM users WHERE id = ?`, [userId]);
  if (!r.length || !r[0].values.length) return false;
  const [storedOtp, expires] = r[0].values[0];
  if (storedOtp !== otp || Date.now() > expires) return false;
  db.run(`UPDATE users SET otp = '', otp_expires = 0, last_login = datetime('now') WHERE id = ?`, [userId]);
  saveDb();
  return true;
}

// ── Settings (per user) ──
function getSetting(key, userId, defaultVal) {
  userId = userId || 0;
  const r = db.exec(`SELECT value FROM settings WHERE key = ? AND user_id = ?`, [key, userId]);
  return (r.length && r[0].values.length) ? r[0].values[0][0] : (defaultVal || null);
}

function setSetting(key, userId, value) {
  userId = userId || 0;
  db.run(`INSERT OR REPLACE INTO settings (key, user_id, value) VALUES (?, ?, ?)`, [key, userId, value]);
  saveDb();
}

function deleteSetting(key, userId) {
  userId = userId || 0;
  db.run(`DELETE FROM settings WHERE key = ? AND user_id = ?`, [key, userId]);
  saveDb();
}

// ── Contacts (per user) ──
function getAllContacts(userId, limit, offset, search) {
  limit = limit || 50; offset = offset || 0; userId = userId || 0;
  let sql = `SELECT * FROM contacts WHERE user_id = ?`;
  const params = [userId];
  if (search) {
    sql += ` AND (recruiter_name LIKE ? OR company LIKE ? OR recruiter_email LIKE ? OR job_title LIKE ?)`;
    const s = '%' + search + '%';
    params.push(s, s, s, s);
  }
  sql += ` ORDER BY id ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return sqlToObjects(db.exec(sql, params));
}

function getContactById(id, userId) {
  const r = db.exec(`SELECT * FROM contacts WHERE id = ? AND user_id = ?`, [id, userId || 0]);
  const rows = sqlToObjects(r);
  return rows.length ? rows[0] : null;
}

function countContacts(userId, where) {
  userId = userId || 0;
  const sql = where
    ? `SELECT COUNT(*) FROM contacts WHERE user_id = ? AND (${where})`
    : `SELECT COUNT(*) FROM contacts WHERE user_id = ?`;
  const r = db.exec(sql, [userId]);
  return (r.length && r[0].values.length) ? r[0].values[0][0] : 0;
}

function countContactsSearch(userId, search) {
  if (!search) return countContacts(userId);
  const s = '%' + search + '%';
  const r = db.exec(`SELECT COUNT(*) FROM contacts WHERE user_id = ? AND (recruiter_name LIKE ? OR company LIKE ? OR recruiter_email LIKE ? OR job_title LIKE ?)`, [userId || 0, s, s, s, s]);
  return (r.length && r[0].values.length) ? r[0].values[0][0] : 0;
}

function getContactsForDrafts(userId, limit) {
  limit = limit || 50;
  const r = db.exec(`SELECT * FROM contacts WHERE user_id = ? AND recruiter_email != '' AND recruiter_email IS NOT NULL AND (email_status IS NULL OR email_status = '' OR email_status = 'Imported from Contacts') AND email_status NOT LIKE '%Draft Created%' AND email_status NOT LIKE '%Sent%' AND email_status NOT LIKE '%BOUNCED%' ORDER BY id ASC LIMIT ?`, [userId || 0, limit]);
  return sqlToObjects(r);
}

function getContactsForSchedule(userId) {
  const r = db.exec(`SELECT * FROM contacts WHERE user_id = ? AND recruiter_email != '' AND recruiter_email IS NOT NULL AND (email_status IS NULL OR email_status = '' OR email_status = 'Imported from Contacts') AND email_status NOT LIKE '%Draft Created%' AND email_status NOT LIKE '%Sent%' AND email_status NOT LIKE '%BOUNCED%' AND email_status NOT LIKE '%Scheduled%' ORDER BY id ASC`, [userId || 0]);
  return sqlToObjects(r);
}

function getSentContacts(userId) {
  const r = db.exec(`SELECT * FROM contacts WHERE user_id = ? AND email_status LIKE '%Sent%' ORDER BY id ASC`, [userId || 0]);
  return sqlToObjects(r);
}

function updateContactStatus(id, emailStatus) { db.run(`UPDATE contacts SET email_status = ? WHERE id = ?`, [emailStatus, id]); saveDb(); }
function updateContactSchedule(id, s, d, t) { db.run(`UPDATE contacts SET email_status=?, schedule_date=?, schedule_time=? WHERE id=?`, [s, d, t, id]); saveDb(); }

function updateContact(id, userId, fields) {
  const allowed = ['recruiter_name', 'company', 'job_title', 'recruiter_email', 'location', 'work_mode', 'job_type', 'platform', 'source_url', 'status', 'priority', 'salary', 'notes', 'date_applied'];
  const sets = [], params = [];
  for (const k of allowed) { if (fields[k] !== undefined) { sets.push(k + '=?'); params.push(fields[k]); } }
  if (!sets.length) return;
  params.push(id, userId || 0);
  db.run(`UPDATE contacts SET ${sets.join(',')} WHERE id=? AND user_id=?`, params);
  saveDb();
}

function deleteContact(id, userId) { db.run(`DELETE FROM contacts WHERE id=? AND user_id=?`, [id, userId || 0]); saveDb(); }
function deleteAllContacts(userId) { db.run(`DELETE FROM contacts WHERE user_id=?`, [userId || 0]); saveDb(); }

function insertContact(userId, data) {
  db.run(`INSERT INTO contacts (user_id,num,date_applied,company,recruiter_name,job_title,recruiter_email,location,work_mode,job_type,platform,source_url,status,priority,salary,phone_screen,interview1,interview2,final_round,offer_date,ats_score,email_status,schedule_date,schedule_time,tracking,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [userId || 0, data.num || null, data.date_applied || '', data.company || '', data.recruiter_name || '', data.job_title || '', data.recruiter_email || '', data.location || '', data.work_mode || '', data.job_type || '', data.platform || '', data.source_url || '', data.status || 'Not Applied', data.priority || '', data.salary || '', data.phone_screen || '', data.interview1 || '', data.interview2 || '', data.final_round || '', data.offer_date || '', data.ats_score || '', data.email_status || '', data.schedule_date || '', data.schedule_time || '', data.tracking || '', data.notes || '']);
  saveDb();
}

function emailExists(userId, email) {
  const r = db.exec(`SELECT COUNT(*) FROM contacts WHERE user_id=? AND LOWER(recruiter_email)=LOWER(?)`, [userId || 0, email]);
  return (r.length && r[0].values.length) ? r[0].values[0][0] > 0 : false;
}

// ── Email Log (per user) ──
function addEmailLog(userId, e) {
  db.run(`INSERT INTO email_log (user_id,schedule_id,email,subject,body,scheduled_at,scheduled_at_text,source_row,status,attempts) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [userId || 0, e.schedule_id, e.email, e.subject, e.body || '', e.scheduled_at, e.scheduled_at_text, e.source_row, e.status || 'Scheduled', e.attempts || 0]);
  saveDb();
}

function getScheduledEmails(userId) {
  const r = db.exec(`SELECT * FROM email_log WHERE user_id=? AND (status='Scheduled' OR status='Retrying') ORDER BY scheduled_at ASC`, [userId || 0]);
  return sqlToObjects(r);
}

function cancelAllScheduled(userId) {
  db.run(`UPDATE email_log SET status='Cancelled',last_result='Cancelled' WHERE user_id=? AND (status='Scheduled' OR status='Retrying')`, [userId || 0]);
  db.run(`UPDATE contacts SET email_status='Cancelled' WHERE user_id=? AND email_status LIKE '%Scheduled%'`, [userId || 0]);
  saveDb();
}

// ── Batch Log ──
function addBatchLog(userId, e) {
  db.run(`INSERT INTO batch_log (user_id,batch_id,run_timestamp,sent_count,failed_count,retried_count,attempted_count,duration_ms,remaining,note) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [userId || 0, e.batch_id, e.run_timestamp, e.sent_count || 0, e.failed_count || 0, e.retried_count || 0, e.attempted_count || 0, e.duration_ms || 0, e.remaining || 0, e.note || '']);
  saveDb();
}

function getBatchLogs(userId, limit) {
  const r = db.exec(`SELECT * FROM batch_log WHERE user_id=? ORDER BY id DESC LIMIT ?`, [userId || 0, limit || 50]);
  return sqlToObjects(r);
}

// ── Daily Count (per user) ──
function getTodayIST() {
  return new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function getDailySendCount(userId) {
  const today = getTodayIST();
  if (getSetting('DAILY_SEND_DATE', userId) !== today) {
    setSetting('DAILY_SEND_DATE', userId, today);
    setSetting('DAILY_SEND_COUNT', userId, '0');
    return 0;
  }
  return parseInt(getSetting('DAILY_SEND_COUNT', userId, '0'), 10);
}

function incrementDailySendCount(userId, n) {
  const today = getTodayIST();
  if (getSetting('DAILY_SEND_DATE', userId) !== today) {
    setSetting('DAILY_SEND_DATE', userId, today);
    setSetting('DAILY_SEND_COUNT', userId, String(n));
  } else {
    const c = parseInt(getSetting('DAILY_SEND_COUNT', userId, '0'), 10);
    setSetting('DAILY_SEND_COUNT', userId, String(c + n));
  }
}

// ── Audit Log ──
function addAudit(userId, action, detail, ip) {
  db.run(`INSERT INTO audit_log (user_id,action,detail,ip) VALUES (?,?,?,?)`, [userId || 0, action, detail || '', ip || '']);
  saveDb();
}

function getAuditLogs(userId, limit) {
  const r = db.exec(`SELECT * FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT ?`, [userId || 0, limit || 100]);
  return sqlToObjects(r);
}

// ── Blocklist ──
function getBlocklist(userId) {
  const r = db.exec(`SELECT * FROM blocklist WHERE user_id=? ORDER BY id DESC`, [userId || 0]);
  return sqlToObjects(r);
}

function addBlocklistEntry(userId, pattern, type) {
  db.run(`INSERT INTO blocklist (user_id,pattern,type) VALUES (?,?,?)`, [userId || 0, pattern, type || 'domain']);
  saveDb();
}

function removeBlocklistEntry(id, userId) {
  db.run(`DELETE FROM blocklist WHERE id=? AND user_id=?`, [id, userId || 0]);
  saveDb();
}

function isBlocked(userId, email) {
  if (!email || typeof email !== 'string') return false;
  const list = getBlocklist(userId);
  const domain = email.split('@')[1] || '';
  return list.some(b => {
    if (b.type === 'domain') return domain.toLowerCase() === b.pattern.toLowerCase();
    if (b.type === 'email') return email.toLowerCase() === b.pattern.toLowerCase();
    return false;
  });
}

// ── Backup ──
function exportBackup() { return db ? Buffer.from(db.export()) : null; }

// ── Local Drafts ──
function addDraft(userId, contactId, toEmail, subject, htmlBody, plainBody) {
  db.run(`INSERT INTO drafts (user_id, contact_id, to_email, subject, html_body, plain_body) VALUES (?,?,?,?,?,?)`,
    [userId, contactId || null, toEmail, subject, htmlBody, plainBody || '']);
  saveDb();
}

function getDrafts(userId, limit) {
  const r = db.exec(`SELECT * FROM drafts WHERE user_id = ? AND status = 'draft' ORDER BY id DESC LIMIT ?`, [userId || 0, limit || 100]);
  return sqlToObjects(r);
}

function getDraftById(id, userId) {
  const r = db.exec(`SELECT * FROM drafts WHERE id = ? AND user_id = ?`, [id, userId || 0]);
  const rows = sqlToObjects(r);
  return rows.length ? rows[0] : null;
}

function deleteDraft(id, userId) {
  db.run(`DELETE FROM drafts WHERE id = ? AND user_id = ?`, [id, userId || 0]);
  saveDb();
}

function markDraftSent(id, userId) {
  db.run(`UPDATE drafts SET status = 'sent' WHERE id = ? AND user_id = ?`, [id, userId || 0]);
  saveDb();
}

function deleteAllDrafts(userId) {
  db.run(`DELETE FROM drafts WHERE user_id = ?`, [userId || 0]);
  saveDb();
}

function countDrafts(userId) {
  const r = db.exec(`SELECT COUNT(*) FROM drafts WHERE user_id = ? AND status = 'draft'`, [userId || 0]);
  return (r.length && r[0].values.length) ? r[0].values[0][0] : 0;
}

module.exports = {
  getDb, saveDb, sqlToObjects,
  getUserByEmail, createUser, setOtp, verifyOtp,
  getSetting, setSetting, deleteSetting,
  getAllContacts, getContactById, countContacts, countContactsSearch,
  getContactsForDrafts, getContactsForSchedule, getSentContacts,
  updateContactStatus, updateContactSchedule,
  updateContact, deleteContact, deleteAllContacts, insertContact, emailExists,
  addEmailLog, getScheduledEmails, cancelAllScheduled,
  addBatchLog, getBatchLogs,
  getDailySendCount, incrementDailySendCount,
  addAudit, getAuditLogs,
  getBlocklist, addBlocklistEntry, removeBlocklistEntry, isBlocked,
  exportBackup,
  addDraft, getDrafts, getDraftById, deleteDraft, markDraftSent, deleteAllDrafts, countDrafts
};
