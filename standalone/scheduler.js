const db = require('./db');
const config = require('./config');
const { stripHtml, sleep } = require('./template-engine');
const emailSender = require('./email-sender');

let schedulerInterval = null;
let stopRequested = false;

function startScheduler() {
  if (schedulerInterval) return;
  // Check every 30 seconds for due emails
  schedulerInterval = setInterval(() => runBatch().catch(e => console.error('[Scheduler]', e)), 30 * 1000);
  console.log('[Scheduler] Started — checking every 30s');
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

function requestStop() { stopRequested = true; }
function clearStop() { stopRequested = false; }
function isStopRequested() { return stopRequested; }

// Exponential backoff with jitter — used when SMTP/Gmail throws transient errors.
// attempt is 1-based; base*2^(attempt-1) ± 25% jitter, capped at 30 minutes.
function backoffMs(attempt) {
  const base = config.RETRY_DELAY_MS;
  const raw = base * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(raw, 30 * 60 * 1000);
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.max(1000, Math.floor(capped + jitter));
}

// Send up to `maxToSend` due emails for a single user. Returns counters.
async function runBatchForUser(uid, maxPerUser) {
  let sent = 0, failed = 0, retried = 0, attempted = 0;

  const dailyCount = db.getDailySendCount(uid);
  const remaining = Math.max(0, config.DAILY_SEND_LIMIT - dailyCount);
  if (remaining <= 0) return { sent, failed, retried, attempted, limited: true };

  const scheduled = db.getScheduledEmails(uid);
  if (scheduled.length === 0) return { sent, failed, retried, attempted, limited: false };

  const now = Date.now();
  const tolerance = 5 * 60 * 1000;
  const cap = Math.min(maxPerUser, remaining);
  const due = scheduled.filter(e => e.scheduled_at <= now + tolerance).slice(0, cap);
  if (due.length === 0) return { sent, failed, retried, attempted, limited: false };

  for (const entry of due) {
    if (stopRequested) break;
    attempted++;
    try {
      const htmlBody = entry.body || entry.subject || '';
      // SMTP-only here: the scheduler runs in-process without per-user OAuth
      // tokens (those live in user sessions). Gmail-API scheduled sends are
      // a Phase 2 concern.
      await emailSender.sendNow(null, entry.email, entry.subject, htmlBody, stripHtml(htmlBody));
      db.incrementDailySendCount(uid, 1);
      const dbInst = await db.getDb();
      dbInst.run(
        `UPDATE email_log SET status = 'Sent', attempts = attempts + 1, last_result = ? WHERE id = ? AND user_id = ?`,
        [new Date().toLocaleString(), entry.id, uid]
      );
      if (entry.source_row) db.updateContactStatus(entry.source_row, 'Sent at ' + new Date().toLocaleString());
      sent++;
    } catch (err) {
      const attempts = (entry.attempts || 0) + 1;
      const dbInst = await db.getDb();
      if (attempts <= config.MAX_RETRIES) {
        const retryAt = Date.now() + backoffMs(attempts);
        dbInst.run(
          `UPDATE email_log SET status = 'Retrying', attempts = ?, scheduled_at = ?, last_result = ? WHERE id = ? AND user_id = ?`,
          [attempts, retryAt, 'Retry: ' + err.message, entry.id, uid]
        );
        retried++;
      } else {
        dbInst.run(
          `UPDATE email_log SET status = 'Failed', attempts = ?, last_result = ? WHERE id = ? AND user_id = ?`,
          [attempts, 'FAILED: ' + err.message, entry.id, uid]
        );
        failed++;
      }
    }
  }
  db.saveDb();
  return { sent, failed, retried, attempted, limited: false };
}

// Top-level tick — iterate every user, isolate quotas and queues.
async function runBatch() {
  const runStart = Date.now();
  const batchId = 'batch_' + runStart;
  await db.getDb();

  const userIds = db.getAllUserIds();
  let totalSent = 0, totalFailed = 0, totalRetried = 0, totalAttempted = 0;
  const notes = [];

  for (const uid of userIds) {
    if (stopRequested) { notes.push('stopped'); break; }
    try {
      const r = await runBatchForUser(uid, config.BATCH_SIZE);
      totalSent += r.sent;
      totalFailed += r.failed;
      totalRetried += r.retried;
      totalAttempted += r.attempted;
      if (r.attempted > 0) {
        db.addBatchLog(uid, {
          batch_id: batchId, run_timestamp: new Date(runStart).toISOString(),
          sent_count: r.sent, failed_count: r.failed, retried_count: r.retried,
          attempted_count: r.attempted, duration_ms: Date.now() - runStart,
          remaining: Math.max(0, config.DAILY_SEND_LIMIT - db.getDailySendCount(uid)),
          note: r.limited ? 'Daily limit reached' : ('uid=' + uid)
        });
      }
    } catch (err) {
      notes.push('uid=' + uid + ' err=' + err.message);
    }
  }

  return {
    sentCount: totalSent, failedCount: totalFailed, retriedCount: totalRetried,
    attemptedCount: totalAttempted, note: notes.join('; ')
  };
}

module.exports = {
  startScheduler, stopScheduler, runBatch, runBatchForUser, backoffMs,
  requestStop, clearStop, isStopRequested
};
