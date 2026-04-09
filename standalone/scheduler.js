const db = require('./db');
const config = require('./config');
const { personalizeMessage, stripHtml, getPersonalizationData, getRandomStaggerMs, sleep } = require('./template-engine');
const emailSender = require('./email-sender');

let schedulerInterval = null;
let stopRequested = false;

function startScheduler() {
  if (schedulerInterval) return;
  // Check every 30 seconds for due emails
  schedulerInterval = setInterval(() => runBatch(), 30 * 1000);
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

async function runBatch() {
  const runStart = Date.now();
  const batchId = 'batch_' + runStart;
  let sentCount = 0, failedCount = 0, retriedCount = 0, attemptedCount = 0, note = '';

  try {
    const dailyCount = db.getDailySendCount(0);
    const remaining = Math.max(0, config.DAILY_SEND_LIMIT - dailyCount);
    if (remaining <= 0) {
      note = 'Daily limit reached.';
      logBatch(batchId, runStart, sentCount, failedCount, retriedCount, attemptedCount, note);
      return { sentCount, failedCount, note };
    }

    const scheduled = db.getScheduledEmails();
    if (scheduled.length === 0) {
      note = 'No scheduled emails.';
      logBatch(batchId, runStart, sentCount, failedCount, retriedCount, attemptedCount, note);
      return { sentCount, failedCount, note };
    }

    const now = Date.now();
    const tolerance = 5 * 60 * 1000;
    const maxToSend = Math.min(config.BATCH_SIZE, remaining);
    const due = scheduled.filter(e => e.scheduled_at <= now + tolerance).slice(0, maxToSend);

    if (due.length === 0) {
      note = 'No emails due yet.';
      logBatch(batchId, runStart, sentCount, failedCount, retriedCount, attemptedCount, note);
      return { sentCount, failedCount, note };
    }

    for (const entry of due) {
      if (stopRequested) { note += ' Stopped by user.'; break; }
      attemptedCount++;

      try {
        const htmlBody = entry.body || entry.subject || '';
        await emailSender.sendNow(null, entry.email, entry.subject, htmlBody, stripHtml(htmlBody));
        db.incrementDailySendCount(entry.user_id || 0, 1);

        // Update email log
        const updateSql = `UPDATE email_log SET status = 'Sent', attempts = attempts + 1, last_result = ? WHERE id = ?`;
        const dbInst = await db.getDb();
        dbInst.run(updateSql, [new Date().toLocaleString(), entry.id]);

        // Update contact status
        if (entry.source_row) {
          db.updateContactStatus(entry.source_row, 'Sent at ' + new Date().toLocaleString());
        }

        sentCount++;
        db.saveDb();
      } catch (err) {
        const attempts = (entry.attempts || 0) + 1;
        if (attempts <= config.MAX_RETRIES) {
          const retryAt = Date.now() + config.RETRY_DELAY_MS;
          const dbInst = await db.getDb();
          dbInst.run(`UPDATE email_log SET status = 'Retrying', attempts = ?, scheduled_at = ?, last_result = ? WHERE id = ?`,
            [attempts, retryAt, 'Retry: ' + err.message, entry.id]);
          retriedCount++;
        } else {
          const dbInst = await db.getDb();
          dbInst.run(`UPDATE email_log SET status = 'Failed', attempts = ?, last_result = ? WHERE id = ?`,
            [attempts, 'FAILED: ' + err.message, entry.id]);
          failedCount++;
        }
        db.saveDb();
      }
    }

    note = 'Processed ' + attemptedCount + ': sent=' + sentCount + ', retried=' + retriedCount + ', failed=' + failedCount;
  } catch (err) {
    note = 'Exception: ' + err.message;
  }

  logBatch(batchId, runStart, sentCount, failedCount, retriedCount, attemptedCount, note);
  return { sentCount, failedCount, retriedCount, attemptedCount, note };
}

function logBatch(batchId, runStart, sentCount, failedCount, retriedCount, attemptedCount, note) {
  db.addBatchLog({
    batch_id: batchId,
    run_timestamp: new Date(runStart).toISOString(),
    sent_count: sentCount,
    failed_count: failedCount,
    retried_count: retriedCount,
    attempted_count: attemptedCount,
    duration_ms: Date.now() - runStart,
    remaining: Math.max(0, config.DAILY_SEND_LIMIT - db.getDailySendCount()),
    note
  });
}

module.exports = {
  startScheduler, stopScheduler, runBatch,
  requestStop, clearStop, isStopRequested
};
