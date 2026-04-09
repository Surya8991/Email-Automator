// ════��═════════════════════════════════════════════════════════════════
//  UNIVERSAL JOB TRACKER — EMAIL AUTOMATION ENGINE (Rewritten)
//  Clean rewrite: const/let only, no unused code, proper error handling,
//  URL validation, trigger cleanup, extracted constants for UI dimensions
// ════════���════════════════════��════════════════════════════════════════


// ═══════════════════ CONFIGURATION ═════════���═════════

// Sheet names
const SHEET_NAME = "📋 Job Tracker";
const CONTACTS_SHEET_NAME = "👥 Contacts";
const DATA_SHEET_NAME = "Data";
const EMAIL_LOG_SHEET_NAME = "Email Log";

// Job Tracker layout
const HEADER_ROW = 2;
const DATA_START_ROW = 3;

// Job Tracker column mapping (A–Y)
const NUM_COL = 1;
const DATE_APPLIED_COL = 2;
const COMPANY_COL = 3;
const RECRUITER_NAME_COL = 4;
const JOB_TITLE_COL = 5;
const RECRUITER_EMAIL_COL = 6;
const LOCATION_COL = 7;
const WORK_MODE_COL = 8;
const JOB_TYPE_COL = 9;
const PLATFORM_COL = 10;
const SOURCE_URL_COL = 11;
const STATUS_COL = 12;
const PRIORITY_COL = 13;
const SALARY_COL = 14;
const PHONE_SCREEN_COL = 15;
const INTERVIEW1_COL = 16;
const INTERVIEW2_COL = 17;
const FINAL_ROUND_COL = 18;
const OFFER_DATE_COL = 19;
const ATS_SCORE_COL = 20;
const EMAIL_STATUS_COL = 21;
const SCHEDULE_DATE_COL = 22;
const SCHEDULE_TIME_COL = 23;
const TRACK_COL = 24;
const NOTES_COL = 25;

// Contacts sheet column mapping (A–J)
const CONTACT_NAME_COL = 1;
const CONTACT_COMPANY_COL = 2;
const CONTACT_ROLE_COL = 3;
const CONTACT_EMAIL_COL = 4;
const CONTACT_LINKEDIN_COL = 5;
const CONTACT_PHONE_COL = 6;
const CONTACT_PLATFORM_COL = 7;
const CONTACT_LAST_CONTACT_COL = 8;
const CONTACT_WARMTH_COL = 9;
const CONTACT_NOTES_COL = 10;

// Data sheet (vertical template layout)
const DATA_SUBJECT_ROW = 2;
const DATA_INITIAL_MSG_ROW = 3;
const DATA_FOLLOW1_MSG_ROW = 4;
const DATA_LAST_FOLLOW_MSG_ROW = 5;
const DATA_VALUE_COL = 2;

// Rate-limiting & batching
const MIN_DELAY_MS = 5000;
const MAX_DELAY_MS = 15000;
const MAX_DRAFTS_PER_RUN = 50;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2 * 60 * 1000;

// Scheduling stagger: 3–5 minutes between each scheduled email
const SCHEDULE_STAGGER_MIN_MS = 3 * 60 * 1000;
const SCHEDULE_STAGGER_MAX_MS = 5 * 60 * 1000;

// Retry & alerts
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1 * 60 * 1000;
const ALERT_RECIPIENT = (() => {
  try { return Session.getActiveUser().getEmail(); } catch (_) { return null; }
})();

// Triggers
const BATCH_TRIGGER_FUNCTION = 'sendScheduledEmailBatch';
const SAFETY_TRIGGER_FUNCTION = 'safetyCheckTrigger';
const SAFETY_TRIGGER_MINUTES = 5;

// Daily limit
const DAILY_SEND_LIMIT = 50;
const DAILY_COUNTER_KEY = 'DAILY_SEND_COUNT';
const DAILY_COUNTER_DATE_KEY = 'DAILY_SEND_DATE';

// Tracking
const WEBAPP_URL_KEY = 'TRACKING_WEBAPP_URL';

// Default signature — edit this with your details. Used when no Gmail signature is found.
const DEFAULT_SIGNATURE = '<br><br>' +
  '<div style="font-family:Arial,sans-serif;font-size:13px;color:#555;">' +
  '<b>Your Name</b><br>' +
  'Your Title<br>' +
  'Your Location<br>' +
  '<a href="https://www.linkedin.com/in/your-profile" style="color:#1a73e8;">LinkedIn</a>' +
  '</div>';

// UI dialog dimensions (extracted magic numbers)
const UI_DRY_RUN = { w: 850, h: 600 };
const UI_TEMPLATE_PICKER = { w: 580, h: 620 };
const UI_TEMPLATE_SELECTOR = { w: 600, h: 700 };
const UI_FOLLOW_UP = { w: 500, h: 300 };
const UI_IMPORT_CONTACTS = { w: 650, h: 600 };
const UI_SCHEDULED = { w: 700, h: 500 };
const UI_PREVIEW = { w: 800, h: 600 };
const UI_VERIFY = { w: 700, h: 500 };

const MENU_NAME = "📧 Email Automation";


// ═══════════════════ DAILY LIMIT GUARD ═════��═════════════

function getDailySendCount() {
  const props = PropertiesService.getScriptProperties();
  const today = new Date().toDateString();
  if (props.getProperty(DAILY_COUNTER_DATE_KEY) !== today) {
    props.setProperty(DAILY_COUNTER_DATE_KEY, today);
    props.setProperty(DAILY_COUNTER_KEY, '0');
    return 0;
  }
  return parseInt(props.getProperty(DAILY_COUNTER_KEY) || '0', 10);
}

function incrementDailySendCount(n) {
  const props = PropertiesService.getScriptProperties();
  const today = new Date().toDateString();
  if (props.getProperty(DAILY_COUNTER_DATE_KEY) !== today) {
    props.setProperty(DAILY_COUNTER_DATE_KEY, today);
    props.setProperty(DAILY_COUNTER_KEY, String(n));
  } else {
    const current = parseInt(props.getProperty(DAILY_COUNTER_KEY) || '0', 10);
    props.setProperty(DAILY_COUNTER_KEY, String(current + n));
  }
}

function canSendEmails(count) {
  return (getDailySendCount() + count) <= DAILY_SEND_LIMIT;
}

function getRemainingDailyQuota() {
  return Math.max(0, DAILY_SEND_LIMIT - getDailySendCount());
}


// ═══════════════════ VALIDATION ════════════════��══

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validates a URL is safe for redirect (http/https only).
 */
function isValidRedirectUrl(url) {
  return url && (url.startsWith('https://') || url.startsWith('http://'));
}


// ═══════════��═══════ PERSONALIZATION ═══════════════════

function getPersonalizationData(row, headers) {
  const data = {
    email: row[RECRUITER_EMAIL_COL - 1] || '',
    name: row[RECRUITER_NAME_COL - 1] || '',
    company: row[COMPANY_COL - 1] || '',
    role_name: row[JOB_TITLE_COL - 1] || '',
    location: row[LOCATION_COL - 1] || '',
    platform: row[PLATFORM_COL - 1] || ''
  };
  if (headers && headers.length) {
    for (let c = 0; c < headers.length; c++) {
      const hdr = String(headers[c]).trim().toLowerCase().replace(/\s+/g, '_');
      if (hdr && row[c] !== undefined && row[c] !== null) {
        data[hdr] = String(row[c]);
      }
    }
  }
  return data;
}

function getTemplatePersonalizationData(row, headers) {
  const data = getPersonalizationData(row, headers);
  try {
    const props = PropertiesService.getScriptProperties();
    data.portfolio_link = props.getProperty('USER_PORTFOLIO_LINK') || 'https://your-portfolio.com';
    if (!data.role_name) {
      data.role_name = props.getProperty('DEFAULT_ROLE_NAME') || '[Role Name]';
    }
  } catch (_) {
    if (!data.portfolio_link) data.portfolio_link = 'https://your-portfolio.com';
    if (!data.role_name) data.role_name = '[Role Name]';
  }
  return data;
}


// ═══════════════════ TEXT UTILITIES ══════��════════════

function personalizeMessage(template, data, skipHtmlWrap) {
  if (!template) return "";
  let out = template;
  for (const key in data) {
    out = out.replace(new RegExp("{{\\s*" + key + "\\s*}}", "g"), data[key] || "");
  }
  if (!skipHtmlWrap && !out.match(/<\/?[a-z][\s\S]*>/i)) {
    out = out.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, "<br>") + '</p>').join("\n");
  }
  return out.trim();
}

function wrapPlainTextAsHtml_(text) {
  if (!text || !text.trim()) return '';
  if (text.match(/<\/?[a-z][\s\S]*>/i)) return text;
  return text.split(/\n{2,}/).map(p => '<p>' + p.trim().replace(/\n/g, '<br>') + '</p>').join('\n');
}

function stripHtml(html) {
  return html
    ? String(html).replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    : "";
}

function getRandomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

function getRandomStaggerMs() {
  return Math.floor(Math.random() * (SCHEDULE_STAGGER_MAX_MS - SCHEDULE_STAGGER_MIN_MS + 1)) + SCHEDULE_STAGGER_MIN_MS;
}


// ═══════���═══════════ DATA SHEET READER ════════��══════════

function getMessageData(dataSheet) {
  const data = dataSheet.getDataRange().getValues();
  if (data.length < DATA_LAST_FOLLOW_MSG_ROW) {
    throw new Error('Data sheet is not properly set up. Run "Setup Sheet Headers" first.');
  }
  return {
    subject: data[DATA_SUBJECT_ROW - 1][DATA_VALUE_COL - 1] || "",
    initialMsg: data[DATA_INITIAL_MSG_ROW - 1][DATA_VALUE_COL - 1] || "",
    follow1Msg: data[DATA_FOLLOW1_MSG_ROW - 1][DATA_VALUE_COL - 1] || "",
    lastFollowMsg: data[DATA_LAST_FOLLOW_MSG_ROW - 1][DATA_VALUE_COL - 1] || ""
  };
}


// ════════���══════════ TRACKING — OPEN / CLICK ═══════���═══════════

function generateTrackingId() {
  return Utilities.getUuid();
}

function injectTracking(htmlBody, email, rowIndex) {
  const trackingId = generateTrackingId();
  const webAppUrl = PropertiesService.getScriptProperties().getProperty(WEBAPP_URL_KEY);

  if (!webAppUrl) {
    return { body: htmlBody, trackingId: trackingId };
  }

  // Open-tracking pixel
  const pixelUrl = webAppUrl + '?action=open&tid=' + trackingId + '&email=' + encodeURIComponent(email);
  const pixel = '<img src="' + pixelUrl + '" width="1" height="1" style="display:none;" alt="" />';

  // Click-tracking link wrapper
  let modifiedBody = htmlBody.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, url, after) => {
      if (url.startsWith('mailto:') || url.startsWith('#')) return match;
      const wrappedUrl = webAppUrl + '?action=click&tid=' + trackingId
        + '&email=' + encodeURIComponent(email) + '&url=' + encodeURIComponent(url);
      return '<a ' + before + 'href="' + wrappedUrl + '"' + after + '>';
    }
  );
  modifiedBody += pixel;

  // Store mapping
  try {
    PropertiesService.getScriptProperties().setProperty(
      'track_' + trackingId,
      JSON.stringify({ email, row: rowIndex, created: new Date().toISOString() })
    );
  } catch (e) {
    Logger.log('Failed to store tracking data: ' + e.message);
  }

  return { body: modifiedBody, trackingId };
}

/**
 * Web app endpoint — handles open pixels and click redirects.
 */
function doGet(e) {
  const params = e.parameter;
  const action = params.action || '';
  const trackingId = params.tid || '';
  const email = params.email || '';
  const url = params.url || '';

  try {
    if (action === 'open') {
      updateTrackingStatus(trackingId, 'Opened');
      return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === 'click') {
      // Validate URL before redirect to prevent open-redirect attacks
      if (!isValidRedirectUrl(url)) {
        return ContentService.createTextOutput('Invalid URL');
      }
      updateTrackingStatus(trackingId, 'Clicked');
      const html = '<html><head><meta http-equiv="refresh" content="0;url=' + encodeURI(url) + '"></head><body>Redirecting...</body></html>';
      return HtmlService.createHtmlOutput(html);
    }
  } catch (err) {
    Logger.log('Tracking doGet error: ' + err.message);
    return ContentService.createTextOutput('Error: ' + err.message).setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService.createTextOutput('OK');
}

function updateTrackingStatus(trackingId, eventType) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('track_' + trackingId);
    if (!raw) return;
    const data = JSON.parse(raw);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet || !data.row) return;

    const current = String(sheet.getRange(data.row, TRACK_COL).getValue() || '');
    const timestamp = new Date().toLocaleString();

    // Upgrade-only: never downgrade Clicked → Opened
    if (eventType === 'Opened' && current.includes('Clicked')) return;
    sheet.getRange(data.row, TRACK_COL).setValue(eventType + ' (' + timestamp + ')');
  } catch (e) {
    Logger.log('updateTrackingStatus error: ' + e.message);
  }
}


// ═══════════════════ BOUNCE HANDLING ═══════���═══════════

function checkBounces() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) { ui.alert('Error', 'Job Tracker sheet not found.', ui.ButtonSet.OK); return; }

  const bounceEmails = searchBounceEmails_([
    'from:mailer-daemon subject:"Delivery Status Notification"',
    'from:mailer-daemon subject:"Mail Delivery Failed"',
    'from:postmaster subject:"Undeliverable"',
    'from:mailer-daemon subject:"failure notice"',
    'subject:"Address not found" from:mailer-daemon'
  ], 50);

  if (bounceEmails.size === 0) {
    ui.alert('Bounce Check', 'No bounced emails found.', ui.ButtonSet.OK);
    return;
  }

  const marked = markBouncedRows_(sheet, bounceEmails);
  ui.alert('Bounce Check Complete',
    'Found ' + bounceEmails.size + ' bounced address(es).\n' + marked + ' row(s) marked.',
    ui.ButtonSet.OK);
}

function autoBounceCheck() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) return;
    const bounceEmails = searchBounceEmails_([
      'from:mailer-daemon newer_than:1d',
      'from:postmaster newer_than:1d'
    ], 20);
    if (bounceEmails.size > 0) markBouncedRows_(sheet, bounceEmails);
  } catch (e) {
    Logger.log('autoBounceCheck error: ' + e.message);
  }
}

/** Shared bounce-email extraction. */
function searchBounceEmails_(queries, maxThreads) {
  const bounceEmails = new Set();
  for (const query of queries) {
    try {
      const threads = GmailApp.search(query, 0, maxThreads);
      for (const thread of threads) {
        for (const msg of thread.getMessages()) {
          const body = msg.getPlainBody().toLowerCase();
          const matches = body.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi);
          if (matches) {
            for (const em of matches) {
              const clean = em.toLowerCase().trim();
              if (!clean.includes('mailer-daemon') && !clean.includes('postmaster')) {
                bounceEmails.add(clean);
              }
            }
          }
        }
      }
    } catch (e) {
      Logger.log('Bounce search error: ' + e.message);
    }
  }
  return bounceEmails;
}

/** Mark bounced rows in the sheet. Returns count of rows marked. */
function markBouncedRows_(sheet, bounceEmails) {
  const allData = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    const email = String(allData[i][RECRUITER_EMAIL_COL - 1]).toLowerCase().trim();
    if (email && bounceEmails.has(email)) {
      const currentStatus = String(sheet.getRange(i + 1, EMAIL_STATUS_COL).getValue());
      if (!currentStatus.includes('BOUNCED')) {
        sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('🔴 BOUNCED');
        count++;
      }
    }
  }
  return count;
}


// ════════��══════════ DRY RUN ════���══════════════

function dryRunEmails() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { ui.alert('Error', 'Job Tracker sheet not found.', ui.ButtonSet.OK); return; }
  if (!dataSheet) { ui.alert('Error', 'Data sheet not found.', ui.ButtonSet.OK); return; }

  const allData = sheet.getDataRange().getValues();
  const headers = allData[HEADER_ROW - 1];
  const messageData = getMessageData(dataSheet);
  const remaining = getRemainingDailyQuota();

  const preview = [];
  let validCount = 0, invalidCount = 0, bouncedCount = 0, alreadyDoneCount = 0;

  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    const email = allData[i][RECRUITER_EMAIL_COL - 1];
    if (!email) continue;
    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (emailStatus.includes('BOUNCED')) { bouncedCount++; continue; }
    if (emailStatus.includes('Draft Created') || emailStatus.includes('Sent')) { alreadyDoneCount++; continue; }
    if (!isValidEmail(email)) {
      invalidCount++;
      preview.push('❌ Row ' + (i + 1) + ': INVALID — "' + email + '"');
      continue;
    }
    const pData = getTemplatePersonalizationData(allData[i], headers);
    const subject = personalizeMessage(messageData.subject, pData, true);
    const plainPreview = stripHtml(personalizeMessage(messageData.initialMsg, pData)).substring(0, 80);
    validCount++;
    preview.push('✅ Row ' + (i + 1) + ': ' + email + ' | Subject: "' + subject + '" | Body: "' + plainPreview + '..."');
  }

  const quotaWarning = validCount > remaining
    ? '<p style="color:red;"><b>⚠️ WARNING:</b> ' + validCount + ' emails exceed remaining quota of ' + remaining + '.</p>'
    : '<p style="color:green;">✅ All ' + validCount + ' emails fit within daily quota.</p>';

  const html = '<h2>🧪 Dry Run Summary</h2>' +
    '<p><b>Ready:</b> ' + validCount + ' | <b>Already done:</b> ' + alreadyDoneCount + ' | <b>Invalid:</b> ' + invalidCount + ' | <b>Bounced:</b> ' + bouncedCount + ' | <b>Quota:</b> ' + remaining + '</p>' +
    quotaWarning + '<hr>' +
    '<div style="font-family:monospace;font-size:12px;max-height:400px;overflow-y:auto;">' +
    preview.map(p => '<div style="padding:3px 0;border-bottom:1px solid #eee;">' + p + '</div>').join('') + '</div>';

  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(UI_DRY_RUN.w).setHeight(UI_DRY_RUN.h), '🧪 Dry Run');
}


// ═══════════════════ DRAFT STOP / RESUME ════════��══════════

function stopCreatingDrafts() {
  PropertiesService.getScriptProperties().setProperty('STOP_DRAFTS', 'true');
  SpreadsheetApp.getUi().alert('Draft creation will stop after the current email finishes.');
}

function resumeCreatingDrafts() {
  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');
  SpreadsheetApp.getUi().alert('Draft creation resumed.');
}

function isDraftStopRequested_() {
  return PropertiesService.getScriptProperties().getProperty('STOP_DRAFTS') === 'true';
}


// ═══════════════════ TEMPLATE PICKER DIALOG ═════��═════════════

function showTemplatePicker_(mode) {
  const templates = getEmailTemplates();
  let jobAppOptions = '', coldOutreachOptions = '';
  for (const key of Object.keys(templates)) {
    const t = templates[key];
    const opt = '<option value="' + key + '">' + t.label + '</option>';
    if (t.category === 'Job Application') jobAppOptions += opt;
    else coldOutreachOptions += opt;
  }

  const htmlContent =
    '<!DOCTYPE html><html><head><base target="_top">' +
    '<style>' +
      'body{font-family:Arial,sans-serif;padding:16px;margin:0;}' +
      'h2{color:#1a73e8;margin:0 0 12px;}' +
      '.section{margin:10px 0;padding:12px;border:1px solid #ddd;border-radius:8px;background:#f8f9fa;}' +
      '.section h3{margin:0 0 6px;font-size:14px;color:#333;}' +
      'select,input[type="text"],textarea{width:100%;padding:7px;font-size:13px;border-radius:4px;border:1px solid #ccc;box-sizing:border-box;margin-bottom:6px;}' +
      'textarea{font-family:Arial,sans-serif;resize:vertical;}' +
      'label{font-weight:bold;display:block;margin-bottom:3px;color:#555;font-size:13px;}' +
      '.radio-group{margin:8px 0;} .radio-group label{font-weight:normal;display:flex;align-items:center;gap:6px;margin:6px 0;cursor:pointer;font-size:13px;}' +
      '.radio-group input[type="radio"]{margin:0;}' +
      '.btn{padding:9px 20px;font-size:13px;border:none;border-radius:6px;cursor:pointer;margin:4px;}' +
      '.btn-primary{background:#1a73e8;color:#fff;} .btn-primary:hover{background:#1557b0;}' +
      '.btn-secondary{background:#f1f3f4;color:#333;} .btn-preview{background:#34a853;color:#fff;}' +
      '#templateOptions,#customSection{display:none;}' +
      '#previewArea{display:none;margin-top:10px;padding:12px;border:2px solid #34a853;border-radius:8px;background:#f1f8f4;max-height:200px;overflow-y:auto;font-size:12px;}' +
      '.tag-info{font-size:11px;color:#666;margin-top:8px;padding:6px;background:#fff3cd;border-radius:4px;}' +
      '.footer{margin-top:14px;text-align:right;}' +
    '</style></head><body>' +
    '<h2>📧 Choose Template for Drafts</h2>' +
    '<div class="section"><div class="radio-group">' +
      '<label><input type="radio" name="source" value="datasheet" checked onchange="toggleSections()"> Use current Data Sheet template</label>' +
      '<label><input type="radio" name="source" value="preset" onchange="toggleSections()"> Choose a preset template</label>' +
      '<label><input type="radio" name="source" value="custom" onchange="toggleSections()"> Write a custom template</label>' +
    '</div></div>' +
    '<div id="templateOptions" class="section">' +
      '<h3>📋 Job Application</h3><select id="jobTemplates"><option value="">-- Select --</option>' + jobAppOptions + '</select>' +
      '<h3>🎯 Cold Outreach</h3><select id="coldTemplates"><option value="">-- Select --</option>' + coldOutreachOptions + '</select>' +
      '<label style="margin-top:8px;">Portfolio Link:</label><input type="text" id="portfolioLink" placeholder="https://your-portfolio.com" />' +
      '<label>Default Role Name (optional):</label><input type="text" id="roleName" placeholder="e.g., SEO Manager" />' +
    '</div>' +
    '<div id="customSection" class="section">' +
      '<h3>✍️ Custom Template</h3>' +
      '<label>Subject:</label><input type="text" id="customSubject" placeholder="Hi {{name}} — Application for {{role_name}} at {{company}}" />' +
      '<label>Initial Message:</label><textarea id="customInitial" rows="5" placeholder="Hi {{name}},\\n\\nI am interested..."></textarea>' +
      '<label>1st Follow-up (optional):</label><textarea id="customFollow1" rows="3"></textarea>' +
      '<label>Last Follow-up (optional):</label><textarea id="customLastFollow" rows="3"></textarea>' +
      '<div class="tag-info"><b>Tags:</b> {{name}}, {{company}}, {{role_name}}, {{email}}, {{location}}, {{platform}}, {{portfolio_link}}</div>' +
    '</div>' +
    '<div id="previewArea"></div>' +
    '<div class="footer">' +
      '<button class="btn btn-secondary" onclick="google.script.host.close()">Cancel</button>' +
      '<button class="btn btn-preview" onclick="doPreview()">👁️ Preview</button>' +
      '<button class="btn btn-primary" onclick="doCreate()">✅ Create Drafts</button>' +
    '</div>' +
    '<script>' +
      'var MODE="' + mode + '";' +
      'function toggleSections(){var v=document.querySelector("input[name=source]:checked").value;' +
        'document.getElementById("templateOptions").style.display=v==="preset"?"block":"none";' +
        'document.getElementById("customSection").style.display=v==="custom"?"block":"none";' +
        'document.getElementById("previewArea").style.display="none";}' +
      'document.getElementById("jobTemplates").addEventListener("change",function(){if(this.value)document.getElementById("coldTemplates").value="";});' +
      'document.getElementById("coldTemplates").addEventListener("change",function(){if(this.value)document.getElementById("jobTemplates").value="";});' +
      'function getSource(){return document.querySelector("input[name=source]:checked").value;}' +
      'function doPreview(){var src=getSource();' +
        'if(src==="datasheet"){google.script.run.withSuccessHandler(showPrev).previewDataSheetTemplate();}' +
        'else if(src==="preset"){var key=document.getElementById("jobTemplates").value||document.getElementById("coldTemplates").value;if(!key){alert("Select a template first.");return;}google.script.run.withSuccessHandler(showPrev).previewTemplateById(key);}' +
        'else{var s=document.getElementById("customSubject").value;var b=document.getElementById("customInitial").value;if(!s||!b){alert("Enter at least subject and initial message.");return;}google.script.run.withSuccessHandler(showPrev).previewCustomTemplate(s,b);}}' +
      'function showPrev(html){var a=document.getElementById("previewArea");a.innerHTML=html;a.style.display="block";}' +
      'function doCreate(){var src=getSource();var choice={source:src};' +
        'if(src==="preset"){choice.templateKey=document.getElementById("jobTemplates").value||document.getElementById("coldTemplates").value;if(!choice.templateKey){alert("Select a template first.");return;}choice.portfolioLink=document.getElementById("portfolioLink").value.trim();choice.roleName=document.getElementById("roleName").value.trim();}' +
        'else if(src==="custom"){choice.subject=document.getElementById("customSubject").value.trim();choice.initialMsg=document.getElementById("customInitial").value.trim();choice.follow1Msg=document.getElementById("customFollow1").value.trim();choice.lastFollowMsg=document.getElementById("customLastFollow").value.trim();if(!choice.subject||!choice.initialMsg){alert("Enter at least subject and initial message.");return;}}' +
        'document.querySelector(".footer").innerHTML="<p style=\\"text-align:center;color:#1a73e8;font-size:14px;\\">⏳ Creating drafts... Check the sheet for progress.</p>";google.script.run.withSuccessHandler(function(){google.script.host.close();}).withFailureHandler(function(e){document.querySelector(".footer").innerHTML="<p style=\\"color:red;\\">Error: "+e.message+"</p>";}).templatePickerCallback_(MODE,JSON.stringify(choice));}' +
    '</script></body></html>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(htmlContent).setWidth(UI_TEMPLATE_PICKER.w).setHeight(UI_TEMPLATE_PICKER.h),
    '📧 Choose Template'
  );
}

function previewDataSheetTemplate() {
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!dataSheet) return '<p style="color:red;">Data sheet not found. Run Setup first.</p>';
  const messageData = getMessageData(dataSheet);
  const sample = { name:'John', company:'Acme Corp', email:'john@acme.com', role_name:'Marketing Manager', location:'Bangalore', platform:'LinkedIn', portfolio_link:'https://portfolio.example.com' };
  return '<h4 style="margin:0 0 5px;">Current Data Sheet Template</h4><p style="margin:2px 0;"><b>Subject:</b> ' +
    personalizeMessage(messageData.subject, sample, true) + '</p><hr style="margin:8px 0;"><div style="font-size:13px;">' +
    personalizeMessage(messageData.initialMsg, sample) + '</div>';
}

function previewCustomTemplate(subject, body) {
  const sample = { name:'John', company:'Acme Corp', email:'john@acme.com', role_name:'Marketing Manager', location:'Bangalore', platform:'LinkedIn', portfolio_link:'https://portfolio.example.com' };
  return '<h4 style="margin:0 0 5px;">Custom Template Preview</h4><p style="margin:2px 0;"><b>Subject:</b> ' +
    personalizeMessage(subject, sample, true) + '</p><hr style="margin:8px 0;"><div style="font-size:13px;">' +
    personalizeMessage(body, sample) + '</div>';
}

function templatePickerCallback_(mode, choiceJson) {
  const choice = JSON.parse(choiceJson);
  if (choice.source === 'preset') {
    loadTemplateToDataSheet(choice.templateKey, choice.portfolioLink || '', choice.roleName || '');
  } else if (choice.source === 'custom') {
    let dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
    if (!dataSheet) { setupSheetHeaders(); dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME); }
    dataSheet.getRange(DATA_SUBJECT_ROW, DATA_VALUE_COL).setValue(choice.subject.replace(/<[^>]*>/g, '').trim());
    dataSheet.getRange(DATA_INITIAL_MSG_ROW, DATA_VALUE_COL).setValue(wrapPlainTextAsHtml_(choice.initialMsg));
    dataSheet.getRange(DATA_FOLLOW1_MSG_ROW, DATA_VALUE_COL).setValue(wrapPlainTextAsHtml_(choice.follow1Msg || ''));
    dataSheet.getRange(DATA_LAST_FOLLOW_MSG_ROW, DATA_VALUE_COL).setValue(wrapPlainTextAsHtml_(choice.lastFollowMsg || ''));
    const infoRow = DATA_LAST_FOLLOW_MSG_ROW + 2;
    dataSheet.getRange(infoRow, 1).setValue("ACTIVE TEMPLATE");
    dataSheet.getRange(infoRow, 2).setValue('[Custom] — loaded ' + new Date().toLocaleString());
    dataSheet.getRange(infoRow, 1, 1, 2).setFontWeight("bold").setBackground("#d4edda");
  }
  // source === 'datasheet' falls through — uses existing Data sheet as-is

  if (mode === 'newEmails') {
    createDraftsForNewEmails_();
  } else if (mode === 'contacts') {
    emailSelectedContacts_fromCallback_();
  }
  return 'done';
}


// ═════��═════════════ DRAFT CREATION — INITIAL EMAILS ═══════════���═══════

function createSingleTestDraft() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { ui.alert('Error', 'Job Tracker sheet not found.', ui.ButtonSet.OK); return; }
  if (!dataSheet) { ui.alert('Error', 'Data sheet not found. Run Setup first.', ui.ButtonSet.OK); return; }

  const allData = sheet.getDataRange().getValues();
  const headers = allData[HEADER_ROW - 1];
  const messageData = getMessageData(dataSheet);
  const signature = getDefaultGmailSignature();

  // Find the first row that is ready to draft
  let targetRow = -1;
  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    const email = allData[i][RECRUITER_EMAIL_COL - 1];
    if (!email) continue;
    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (emailStatus.includes('BOUNCED') || emailStatus.includes('Draft Created') || emailStatus.includes('Sent')) continue;
    if (!isValidEmail(email)) continue;
    targetRow = i;
    break;
  }

  if (targetRow === -1) {
    ui.alert('No Rows Available', 'No rows found with a valid email that haven\'t been drafted/sent yet.\n\nCheck:\n- Column ' + String.fromCharCode(64 + RECRUITER_EMAIL_COL) + ' (Recruiter Email) has email addresses\n- Column ' + String.fromCharCode(64 + EMAIL_STATUS_COL) + ' (Email Status) is not already "Draft Created" or "Sent"', ui.ButtonSet.OK);
    return;
  }

  const row = allData[targetRow];
  const email = row[RECRUITER_EMAIL_COL - 1];
  const pData = getTemplatePersonalizationData(row, headers);
  const subject = personalizeMessage(messageData.subject, pData, true);
  const body = personalizeMessage(messageData.initialMsg, pData);
  const finalBody = body + (signature || '');
  const plainPreview = stripHtml(body).substring(0, 150);

  // Show preview and ask for confirmation
  const confirm = ui.alert('Create 1 Test Draft?',
    'Row: ' + (targetRow + 1) +
    '\nTo: ' + email +
    '\nName: ' + (pData.name || 'N/A') +
    '\nCompany: ' + (pData.company || 'N/A') +
    '\nSubject: ' + subject +
    '\n\nBody preview:\n' + plainPreview + '...' +
    '\n\nCreate this draft in Gmail?',
    ui.ButtonSet.YES_NO);

  if (confirm !== ui.Button.YES) return;

  try {
    GmailApp.createDraft(email, subject, stripHtml(finalBody), { htmlBody: finalBody });
    sheet.getRange(targetRow + 1, EMAIL_STATUS_COL).setValue('✅ Initial Draft Created (' + new Date().toLocaleString() + ')');
    ui.alert('Draft Created!', 'Check your Gmail Drafts folder.\n\nTo: ' + email + '\nSubject: ' + subject, ui.ButtonSet.OK);
  } catch (err) {
    sheet.getRange(targetRow + 1, EMAIL_STATUS_COL).setValue('Error ❌: ' + err.message);
    ui.alert('Error', 'Failed to create draft: ' + err.message, ui.ButtonSet.OK);
  }
}

function createDraftsForNewEmails() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { ui.alert('Error', 'Job Tracker sheet not found.', ui.ButtonSet.OK); return; }
  if (!dataSheet) { ui.alert('Error', 'Data sheet not found. Run Setup first.', ui.ButtonSet.OK); return; }

  const allData = sheet.getDataRange().getValues();
  const headers = allData[HEADER_ROW - 1];
  const messageData = getMessageData(dataSheet);

  if (!messageData.subject || !messageData.initialMsg) {
    ui.alert('Error', 'No email template found in Data sheet.\n\nLoad a template first from Email Templates menu, or edit the Data sheet directly (B2=Subject, B3=Message).', ui.ButtonSet.OK);
    return;
  }

  // Count how many are ready
  let readyCount = 0;
  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    const email = allData[i][RECRUITER_EMAIL_COL - 1];
    if (!email) continue;
    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (emailStatus.includes('BOUNCED') || emailStatus.includes('Draft Created') || emailStatus.includes('Sent')) continue;
    if (!isValidEmail(email)) continue;
    readyCount++;
  }

  if (readyCount === 0) {
    ui.alert('No Rows Available', 'No rows with valid emails ready for drafting.\n\nCheck column ' + String.fromCharCode(64 + RECRUITER_EMAIL_COL) + ' has emails and column ' + String.fromCharCode(64 + EMAIL_STATUS_COL) + ' is not already processed.', ui.ButtonSet.OK);
    return;
  }

  const toProcess = Math.min(readyCount, MAX_DRAFTS_PER_RUN);
  const confirm = ui.alert('📧 Create Bulk Drafts',
    'Ready to draft: ' + readyCount + ' emails\nWill create: ' + toProcess + ' drafts (limit: ' + MAX_DRAFTS_PER_RUN + ')\nTemplate: "' + messageData.subject.substring(0, 50) + '..."\nDelay: 5-15 sec between each\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // Run the draft creation directly
  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');
  const signature = getDefaultGmailSignature();
  let processed = 0, errors = 0, skippedInvalid = 0, skippedBounced = 0;
  let stoppedByUser = false, hitLimit = false;

  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    if (isDraftStopRequested_()) { stoppedByUser = true; break; }
    if (processed >= MAX_DRAFTS_PER_RUN) { hitLimit = true; break; }

    const email = allData[i][RECRUITER_EMAIL_COL - 1];
    if (!email) continue;

    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (emailStatus.includes('BOUNCED')) { skippedBounced++; continue; }
    if (!isValidEmail(email)) { sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('❌ Invalid email format'); skippedInvalid++; continue; }
    if (emailStatus.includes('Draft Created') || emailStatus.includes('Sent')) continue;

    try {
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('Processing... (' + (processed + 1) + '/' + toProcess + ')');
      SpreadsheetApp.flush();

      const pData = getTemplatePersonalizationData(allData[i], headers);
      const subject = personalizeMessage(messageData.subject, pData, true);
      const finalBody = personalizeMessage(messageData.initialMsg, pData) + (signature || "");

      GmailApp.createDraft(email, subject, stripHtml(finalBody), { htmlBody: finalBody });
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('✅ Initial Draft Created (' + new Date().toLocaleString() + ')');
      processed++;
      Utilities.sleep(getRandomDelay());
    } catch (err) {
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('Error ❌: ' + err.message);
      errors++;
    }
  }

  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');

  let summary = 'Drafts created: ' + processed + '/' + MAX_DRAFTS_PER_RUN + ' limit\nInvalid skipped: ' + skippedInvalid + '\nBounced skipped: ' + skippedBounced + '\nErrors: ' + errors;
  if (stoppedByUser) summary += '\n\n🛑 Stopped by user.';
  if (hitLimit) summary += '\n\n⚠️ Hit limit. Run again for remaining.';
  ui.alert('Done!', summary, ui.ButtonSet.OK);
}

/**
 * Create drafts via template picker dialog (alternative flow).
 */
function createDraftsWithTemplatePicker() {
  showTemplatePicker_('newEmails');
}

function createDraftsForNewEmails_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!sheet) throw new Error('Job Tracker sheet not found.');
  if (!dataSheet) throw new Error('Data sheet not found. Run Setup first.');

  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');
  const allData = sheet.getDataRange().getValues();
  const headers = allData[HEADER_ROW - 1];
  const messageData = getMessageData(dataSheet);
  const signature = getDefaultGmailSignature();
  let processed = 0, errors = 0, skippedInvalid = 0, skippedBounced = 0;
  let stoppedByUser = false, hitLimit = false;

  let totalEmails = 0;
  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (allData[i][RECRUITER_EMAIL_COL - 1] && !emailStatus.includes('Draft Created') && !emailStatus.includes('Sent')) totalEmails++;
  }

  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    if (isDraftStopRequested_()) { stoppedByUser = true; break; }
    if (processed >= MAX_DRAFTS_PER_RUN) { hitLimit = true; break; }

    const email = allData[i][RECRUITER_EMAIL_COL - 1];
    if (!email) continue;

    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (emailStatus.includes('BOUNCED')) { skippedBounced++; continue; }
    if (!isValidEmail(email)) { sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('❌ Invalid email format'); skippedInvalid++; continue; }
    if (emailStatus.includes('Draft Created') || emailStatus.includes('Sent')) continue;

    try {
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('Processing... (' + (processed + 1) + '/' + Math.min(totalEmails, MAX_DRAFTS_PER_RUN) + ')');
      SpreadsheetApp.flush();

      const pData = getTemplatePersonalizationData(allData[i], headers);
      const subject = personalizeMessage(messageData.subject, pData, true);
      const finalBody = personalizeMessage(messageData.initialMsg, pData) + (signature || "");

      GmailApp.createDraft(email, subject, stripHtml(finalBody), { htmlBody: finalBody });
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('✅ Initial Draft Created (' + new Date().toLocaleString() + ')');
      processed++;
      Utilities.sleep(getRandomDelay());
    } catch (err) {
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('Error ❌: ' + err.message);
      errors++;
    }
  }

  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');
  Logger.log('Draft creation complete: created=' + processed + ', invalid=' + skippedInvalid + ', bounced=' + skippedBounced + ', errors=' + errors);
}


// ═══════════════════ FOLLOW-UP DRAFTS — SAME THREAD ═══════════════════

function createDraftsForSentEmails() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_top"></head><body>' +
    '<h2>📧 Create Follow-up Drafts (Same Thread)</h2>' +
    '<div>Select follow-ups to create as replies in the original thread:</div><br>' +
    '<label><input type="checkbox" id="follow1" checked> 1st Follow-up</label><br>' +
    '<label><input type="checkbox" id="lastFollow" checked> Last Follow-up</label><br><br>' +
    '<button onclick="google.script.host.close()">Cancel</button> ' +
    '<button onclick="createDrafts()">Create Drafts</button>' +
    '<script>function createDrafts(){' +
    'var f1=document.getElementById("follow1").checked;var lf=document.getElementById("lastFollow").checked;' +
    'google.script.run.withSuccessHandler(function(r){alert(r);google.script.host.close();}).withFailureHandler(function(e){alert("Error: "+e.message);}).processSelectedDrafts(f1,lf);}' +
    '</script></body></html>'
  ).setWidth(UI_FOLLOW_UP.w).setHeight(UI_FOLLOW_UP.h);
  ui.showModalDialog(html, '📧 Create Follow-up Drafts');
}

function processSelectedDrafts(includeFollow1, includeLastFollow) {
  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!sheet) throw new Error('Job Tracker sheet not found.');
  if (!dataSheet) throw new Error('Data sheet not found.');

  const allData = sheet.getDataRange().getValues();
  const headers = allData[HEADER_ROW - 1];
  const messageData = getMessageData(dataSheet);
  const signature = getDefaultGmailSignature();
  let processed = 0, errors = 0, noThread = 0;
  let stoppedByUser = false, hitLimit = false;

  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    if (isDraftStopRequested_()) { stoppedByUser = true; break; }
    if (processed >= MAX_DRAFTS_PER_RUN) { hitLimit = true; break; }

    const email = allData[i][RECRUITER_EMAIL_COL - 1];
    if (!email) continue;
    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (emailStatus.includes('BOUNCED') || !isValidEmail(email)) continue;
    // Only create follow-ups for rows that have actually been Sent
    if (!emailStatus.includes('Sent')) continue;

    try {
      const pData = getTemplatePersonalizationData(allData[i], headers);
      const subject = personalizeMessage(messageData.subject, pData, true);

      // Find original sent thread
      let thread = null;
      let searchQuery = 'to:' + email + ' subject:"' + subject + '" in:sent';
      let threads = GmailApp.search(searchQuery, 0, 1);
      if (threads.length > 0) {
        thread = threads[0];
      } else {
        searchQuery = 'to:' + email + ' in:sent';
        threads = GmailApp.search(searchQuery, 0, 5);
        if (threads.length > 0) thread = threads[0];
      }

      if (!thread) {
        sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('⚠️ No sent email found for ' + email);
        noThread++;
        continue;
      }

      // Find correct reply-to address
      const messages = thread.getMessages();
      let recipientForReply = email;
      const userEmail = Session.getActiveUser().getEmail();
      for (let iMsg = messages.length - 1; iMsg >= 0; iMsg--) {
        const fromEmail = messages[iMsg].getFrom();
        let cleanFrom = fromEmail;
        const m = fromEmail.match(/<([^>]+)>/);
        if (m) cleanFrom = m[1];
        else if (fromEmail.includes('@')) cleanFrom = fromEmail.trim().split(',')[0].trim();
        if (!cleanFrom.toLowerCase().includes(userEmail.toLowerCase()) && cleanFrom.includes('@')) {
          recipientForReply = cleanFrom;
          break;
        }
      }

      const draftsCreated = [];
      if (includeFollow1 && messageData.follow1Msg) {
        const body = personalizeMessage(messageData.follow1Msg, pData) + (signature || "");
        thread.createDraftReply(stripHtml(body), { htmlBody: body });
        draftsCreated.push("Follow-1");
        if (includeLastFollow && messageData.lastFollowMsg) Utilities.sleep(getRandomDelay());
      }
      if (includeLastFollow && messageData.lastFollowMsg) {
        const body = personalizeMessage(messageData.lastFollowMsg, pData) + (signature || "");
        thread.createDraftReply(stripHtml(body), { htmlBody: body });
        draftsCreated.push("Last Follow");
      }

      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('✅ Created: ' + draftsCreated.join(", ") + ' in thread (' + new Date().toLocaleString() + ')');
      processed++;
      Utilities.sleep(getRandomDelay());
    } catch (err) {
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('Error ❌: ' + err.message);
      errors++;
    }
  }

  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');
  let summary = 'Processed: ' + processed + '\nNo thread found: ' + noThread + '\nErrors: ' + errors;
  if (stoppedByUser) summary += '\n\n🛑 Stopped by user.';
  if (hitLimit) summary += '\n\n⚠️ Hit limit. Run again for remaining.';
  return summary;
}


// ═══════════════════ DATE / TIME HELPERS ════════���══════════

function combineDateAndTime_(dateValue, timeValue) {
  if (!(dateValue instanceof Date)) return null;
  let hours = 0, minutes = 0;
  if (timeValue instanceof Date) {
    hours = timeValue.getHours();
    minutes = timeValue.getMinutes();
  } else if (typeof timeValue === 'string' && timeValue.trim()) {
    const m = timeValue.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const mer = (m[3] || '').toUpperCase();
      if (mer === 'PM' && h < 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      hours = h;
      minutes = parseInt(m[2], 10);
    }
  }
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), hours, minutes, 0, 0);
}


// ══════���════════════ SCHEDULING ═══════════════���═══

function scheduleEmails() {
  const ui = SpreadsheetApp.getUi();

  // Ask user for start date
  const dateResult = ui.prompt('⏰ Schedule Emails — Step 1/2',
    'Enter the START DATE for sending emails:\n\nFormat: MM/DD/YYYY\nExample: 04/07/2026',
    ui.ButtonSet.OK_CANCEL);
  if (dateResult.getSelectedButton() !== ui.Button.OK) return;
  const dateStr = dateResult.getResponseText().trim();

  // Ask user for start time
  const timeResult = ui.prompt('⏰ Schedule Emails — Step 2/2',
    'Enter the START TIME for the first email:\n\nFormat: HH:MM AM/PM\nExample: 09:30 AM',
    ui.ButtonSet.OK_CANCEL);
  if (timeResult.getSelectedButton() !== ui.Button.OK) return;
  const timeStr = timeResult.getResponseText().trim();

  // Parse the start date/time
  const dateParts = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dateParts) { ui.alert('Error', 'Invalid date format. Use MM/DD/YYYY.', ui.ButtonSet.OK); return; }
  const startDate = new Date(parseInt(dateParts[3], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
  if (isNaN(startDate.getTime())) { ui.alert('Error', 'Invalid date.', ui.ButtonSet.OK); return; }

  const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!timeParts) { ui.alert('Error', 'Invalid time format. Use HH:MM AM/PM (e.g., 09:30 AM).', ui.ButtonSet.OK); return; }
  let startHour = parseInt(timeParts[1], 10);
  const startMin = parseInt(timeParts[2], 10);
  const meridiem = (timeParts[3] || '').toUpperCase();
  if (meridiem === 'PM' && startHour < 12) startHour += 12;
  if (meridiem === 'AM' && startHour === 12) startHour = 0;

  const startTime = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startHour, startMin, 0, 0);
  if (startTime <= new Date()) { ui.alert('Error', 'Start time must be in the future.', ui.ButtonSet.OK); return; }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { ui.alert('Error', 'Job Tracker sheet not found.', ui.ButtonSet.OK); return; }
  if (!dataSheet) { ui.alert('Error', 'Data sheet not found.', ui.ButtonSet.OK); return; }

  const allData = sheet.getDataRange().getValues();
  const headers = allData[HEADER_ROW - 1];
  const messageData = getMessageData(dataSheet);
  const signature = getDefaultGmailSignature();
  let scheduled = 0, errors = 0, skipped = 0;

  // Running clock — each email gets staggered by 3-5 min random delay
  let nextSendTime = startTime.getTime();

  for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
    const email = allData[i][RECRUITER_EMAIL_COL - 1];
    if (!email) continue;

    const emailStatus = String(allData[i][EMAIL_STATUS_COL - 1] || '');
    if (emailStatus.includes('BOUNCED')) { skipped++; continue; }
    if (emailStatus.includes('Scheduled') || emailStatus.includes('Draft Created') || emailStatus.includes('Sent')) { skipped++; continue; }
    if (!isValidEmail(email)) { sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('❌ Invalid email format'); errors++; continue; }

    try {
      const scheduleTime = new Date(nextSendTime);

      const pData = getTemplatePersonalizationData(allData[i], headers);
      const emailData = {
        email: email,
        subject: personalizeMessage(messageData.subject, pData, true),
        message: personalizeMessage(messageData.initialMsg, pData),
        signature: signature,
        row: i + 1,
        scheduledAt: scheduleTime.getTime(),
        attempts: 0
      };

      const scheduleId = 'schedule_' + scheduleTime.getTime() + '_' + i;
      PropertiesService.getScriptProperties().setProperty(scheduleId, JSON.stringify(emailData));
      PropertiesService.getScriptProperties().setProperty(scheduleId + '_trigger', 'active');
      addScheduledDataRow(scheduleId, emailData);

      const formattedTime = Utilities.formatDate(scheduleTime, Session.getScriptTimeZone(), "MMM dd, yyyy hh:mm a");
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('⏰ Scheduled for ' + formattedTime);
      sheet.getRange(i + 1, SCHEDULE_DATE_COL).setValue(scheduleTime);
      sheet.getRange(i + 1, SCHEDULE_TIME_COL).setValue(Utilities.formatDate(scheduleTime, Session.getScriptTimeZone(), "hh:mm a"));
      scheduled++;

      // Stagger next email by 3-5 minutes
      nextSendTime += getRandomStaggerMs();

    } catch (err) {
      sheet.getRange(i + 1, EMAIL_STATUS_COL).setValue('Error ❌: ' + err.message);
      errors++;
    }
  }

  if (scheduled > 0) {
    ensureSafetyTrigger();
    cleanupBatchTriggers();
    ScriptApp.newTrigger(BATCH_TRIGGER_FUNCTION).timeBased().at(new Date(Date.now() + 30000)).create();
  }

  const endTime = new Date(nextSendTime);
  const formattedStart = Utilities.formatDate(startTime, Session.getScriptTimeZone(), "MMM dd, yyyy hh:mm a");
  const formattedEnd = Utilities.formatDate(endTime, Session.getScriptTimeZone(), "MMM dd, yyyy hh:mm a");

  ui.alert('Scheduling Complete!',
    'Scheduled: ' + scheduled + '\nSkipped: ' + skipped + '\nErrors: ' + errors +
    '\n\nFirst email: ' + formattedStart +
    '\nLast email: ~' + formattedEnd +
    '\nDelay between emails: 3–5 min (random)' +
    '\nQuota remaining: ' + getRemainingDailyQuota(),
    ui.ButtonSet.OK);
}


// ══════════���════════ EMAIL LOG SHEET ═══════════════════

function initEmailLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EMAIL_LOG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(EMAIL_LOG_SHEET_NAME);
  if (sheet.getRange(1, 1).getValue() === 'ScheduleId') return sheet;

  sheet.clear();
  const schedHeaders = ["ScheduleId","Email","Subject","ScheduledAt","ScheduledAtText","SourceRow","Status","Attempts","LastResult","PropertyExists"];
  sheet.getRange(1, 1, 1, schedHeaders.length).setValues([schedHeaders]).setFontWeight('bold').setBackground('#f4b084');
  sheet.setColumnWidth(11, 10);

  const logHeaders = ["RunTimestamp","BatchId","SentCount","FailedCount","RetriedCount","AttemptedCount","DurationMs","Remaining","Note"];
  sheet.getRange(1, 12, 1, logHeaders.length).setValues([logHeaders]).setFontWeight('bold').setBackground('#cfe2f3');

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 10, 140);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(12, 180);
  sheet.setColumnWidth(20, 300);
  return sheet;
}

function initScheduledDataSheet() { return initEmailLogSheet(); }

function appendSchedulerLogEntry(entry) {
  try {
    const sheet = initEmailLogSheet();
    const lastLogRow = Math.max(sheet.getLastRow(), 1);
    sheet.getRange(lastLogRow + 1, 12, 1, 9).setValues([[
      entry.runTimestamp || new Date().toISOString(),
      entry.batchId || ('batch_' + Date.now()),
      entry.sentCount || 0, entry.failedCount || 0, entry.retriedCount || 0,
      entry.attemptedCount || 0, entry.durationMs || 0, entry.remaining || 0, entry.note || ""
    ]]);
  } catch (e) { Logger.log('appendSchedulerLogEntry error: ' + e.message); }
}

function addScheduledDataRow(scheduleId, emailData) {
  try {
    const sheet = initScheduledDataSheet();
    const formatted = Utilities.formatDate(new Date(parseInt(emailData.scheduledAt, 10)), Session.getScriptTimeZone(), "MMM dd, yyyy HH:mm");
    sheet.appendRow([scheduleId, emailData.email || "", emailData.subject || "", emailData.scheduledAt || "", formatted, emailData.row || "", "Scheduled", 0, "", true]);
  } catch (err) { Logger.log('addScheduledDataRow error: ' + err.message); }
}

function updateScheduledDataRow(scheduleId, updates) {
  try {
    const sheet = initScheduledDataSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;
    const header = data[0].map(String);
    const idCol = header.indexOf('ScheduleId');
    if (idCol === -1) return false;
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][idCol]) === String(scheduleId)) {
        for (const key in updates) {
          const ci = header.indexOf(key);
          if (ci !== -1) sheet.getRange(r + 1, ci + 1).setValue(updates[key]);
        }
        return true;
      }
    }
    return false;
  } catch (err) { Logger.log('updateScheduledDataRow error: ' + err.message); return false; }
}

function getScheduledDataValue(scheduleId, columnName) {
  try {
    const sheet = initScheduledDataSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(String);
    const ci = headers.indexOf(columnName);
    const idCol = headers.indexOf('ScheduleId');
    if (ci === -1 || idCol === -1) return null;
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][idCol]) === String(scheduleId)) return data[r][ci];
    }
  } catch (e) { Logger.log('getScheduledDataValue error: ' + e.message); }
  return null;
}

function markPropertyDeleted(scheduleId) {
  try { updateScheduledDataRow(scheduleId, { "PropertyExists": false }); } catch (_) {}
}


// ══════════���════════ BATCH RUNNER ══════════════���════

function sendScheduledEmailBatch(e) {
  const runStart = Date.now();
  const batchId = 'batch_' + runStart;
  let sentCount = 0, failedCount = 0, retriedCount = 0, attemptedCount = 0, note = '';

  const logResult = () => appendSchedulerLogEntry({
    runTimestamp: new Date(runStart).toISOString(), batchId, sentCount, failedCount,
    retriedCount, attemptedCount, durationMs: Date.now() - runStart,
    remaining: 0, note
  });

  try {
    const remaining = getRemainingDailyQuota();
    if (remaining <= 0) { note = 'Daily limit reached.'; logResult(); return; }

    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();
    const keys = Object.keys(allProps).filter(k => k.startsWith('schedule_') && !k.endsWith('_trigger'));

    if (keys.length === 0) {
      cleanupBatchTriggers(); removeSafetyTrigger();
      note = 'No schedule_ items found.'; logResult(); return;
    }

    // Build & sort items list
    const items = [];
    for (const key of keys) {
      try {
        const raw = props.getProperty(key);
        if (!raw) { props.deleteProperty(key); props.deleteProperty(key + '_trigger'); markPropertyDeleted(key); continue; }
        const data = JSON.parse(raw);
        const scheduledAt = data.scheduledAt ? parseInt(data.scheduledAt, 10) : extractTimestampFromKey(key);
        items.push({ key, scheduledAt: isNaN(scheduledAt) ? 0 : scheduledAt, data });
      } catch (_) {
        try { props.deleteProperty(key); props.deleteProperty(key + '_trigger'); } catch (__) {}
        markPropertyDeleted(key);
      }
    }

    if (items.length === 0) {
      cleanupBatchTriggers(); removeSafetyTrigger();
      note = 'No valid items after parsing.'; logResult(); return;
    }

    items.sort((a, b) => a.scheduledAt - b.scheduledAt);

    const now = Date.now();
    const toleranceMs = 5 * 60 * 1000;
    const maxToSend = Math.min(BATCH_SIZE, remaining);
    const toSend = [];
    for (let idx = 0; idx < items.length && toSend.length < maxToSend; idx++) {
      if (items[idx].scheduledAt <= now + toleranceMs) {
        toSend.push(items[idx]);
      } else {
        if (toSend.length === 0 && idx === 0) toSend.push(items[idx]);
        else break;
      }
    }

    if (toSend.length === 0) {
      cleanupBatchTriggers();
      note = 'No items due.'; logResult(); return;
    }

    // Process batch
    for (const entry of toSend) {
      const scheduleId = entry.key;
      const emailData = entry.data;
      attemptedCount++;

      // Skip bounced
      try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        if (sheet && emailData.row) {
          if (String(sheet.getRange(emailData.row, EMAIL_STATUS_COL).getValue()).includes('BOUNCED')) {
            props.deleteProperty(scheduleId); props.deleteProperty(scheduleId + '_trigger');
            updateScheduledDataRow(scheduleId, { "Status": "Skipped-Bounced", "PropertyExists": false, "LastResult": "Bounced" });
            continue;
          }
        }
      } catch (_) {}

      try {
        let finalBody = emailData.message + (emailData.signature || "");
        const tracking = injectTracking(finalBody, emailData.email, emailData.row);
        finalBody = tracking.body;

        GmailApp.sendEmail(emailData.email, emailData.subject, stripHtml(finalBody), { htmlBody: finalBody });
        incrementDailySendCount(1);

        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        if (sheet && emailData.row) {
          sheet.getRange(emailData.row, EMAIL_STATUS_COL).setValue('✅ Sent at ' + new Date().toLocaleString());
          if (tracking.trackingId) sheet.getRange(emailData.row, TRACK_COL).setValue('Tracking: ' + tracking.trackingId);
        }

        updateScheduledDataRow(scheduleId, {
          "Status": "Sent", "Attempts": (parseInt(getScheduledDataValue(scheduleId, 'Attempts') || 0, 10) + 1),
          "LastResult": new Date().toLocaleString(), "PropertyExists": false
        });
        try { props.deleteProperty(scheduleId); props.deleteProperty(scheduleId + '_trigger'); } catch (_) {}
        sentCount++;

      } catch (sendErr) {
        Logger.log('BATCH[' + batchId + ']: Failed ' + emailData.email + ': ' + sendErr.message);
        const prevAttempts = parseInt(getScheduledDataValue(scheduleId, 'Attempts') || (emailData.attempts || 0), 10);
        const newAttempts = prevAttempts + 1;

        if (newAttempts <= MAX_RETRIES) {
          const retryAt = new Date(Date.now() + RETRY_DELAY_MS);
          const newEmailData = Object.assign({}, emailData, { attempts: newAttempts, scheduledAt: retryAt.getTime() });
          props.setProperty(scheduleId, JSON.stringify(newEmailData));
          props.setProperty(scheduleId + '_trigger', 'active');
          updateScheduledDataRow(scheduleId, {
            "Status": "Retrying", "Attempts": newAttempts,
            "LastResult": 'Retry @ ' + Utilities.formatDate(retryAt, Session.getScriptTimeZone(), 'MMM dd HH:mm'),
            "ScheduledAt": newEmailData.scheduledAt,
            "ScheduledAtText": Utilities.formatDate(retryAt, Session.getScriptTimeZone(), 'MMM dd, yyyy HH:mm'),
            "PropertyExists": true
          });
          retriedCount++;
        } else {
          updateScheduledDataRow(scheduleId, { "Status": "Failed", "Attempts": newAttempts, "LastResult": 'ERROR: ' + sendErr.message, "PropertyExists": false });
          try {
            const admin = ALERT_RECIPIENT || Session.getActiveUser().getEmail();
            if (admin) MailApp.sendEmail(admin, 'Scheduled Email Failed: ' + emailData.email, 'Failed after ' + newAttempts + ' attempts.\nError: ' + sendErr.message);
          } catch (_) {}
          failedCount++;
          try { props.deleteProperty(scheduleId); props.deleteProperty(scheduleId + '_trigger'); } catch (_) {}
        }

        try {
          const sheetRef = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
          if (sheetRef && emailData.row) sheetRef.getRange(emailData.row, EMAIL_STATUS_COL).setValue('❌ Send failed: ' + sendErr.message);
        } catch (_) {}
      }
    }

    // Schedule next batch or cleanup
    const remainingKeys = Object.keys(props.getProperties()).filter(k => k.startsWith('schedule_') && !k.endsWith('_trigger'));
    if (remainingKeys.length > 0) {
      cleanupBatchTriggers();
      ScriptApp.newTrigger(BATCH_TRIGGER_FUNCTION).timeBased().at(new Date(Date.now() + BATCH_DELAY_MS)).create();
    } else {
      cleanupBatchTriggers();
      removeSafetyTrigger();
    }

    note = 'Processed ' + attemptedCount + ': sent=' + sentCount + ', retried=' + retriedCount + ', failed=' + failedCount;
    logResult();

  } catch (err) {
    Logger.log('BATCH[' + batchId + '] Error: ' + err.message);
    note = 'Exception: ' + err.message;
    logResult();
  }
}


// ═══════════════════ TRIGGER MANAGEMENT ═══════��═══════════

function ensureSafetyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(t => t.getHandlerFunction() === SAFETY_TRIGGER_FUNCTION)) {
    ScriptApp.newTrigger(SAFETY_TRIGGER_FUNCTION).timeBased().everyMinutes(SAFETY_TRIGGER_MINUTES).create();
  }
}

function removeSafetyTrigger() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === SAFETY_TRIGGER_FUNCTION) ScriptApp.deleteTrigger(t);
  }
}

function cleanupBatchTriggers() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === BATCH_TRIGGER_FUNCTION) {
      try { ScriptApp.deleteTrigger(t); } catch (_) {}
    }
  }
}

function cleanupOldBatchTriggers() {
  let deleted = 0;
  for (const t of ScriptApp.getProjectTriggers()) {
    const handler = t.getHandlerFunction();
    if (handler === BATCH_TRIGGER_FUNCTION || handler === SAFETY_TRIGGER_FUNCTION) {
      try { ScriptApp.deleteTrigger(t); deleted++; } catch (_) {}
    }
  }
  Logger.log('cleanupOldBatchTriggers: deleted ' + deleted + ' triggers.');
}

function safetyCheckTrigger() {
  try {
    const props = PropertiesService.getScriptProperties();
    const remaining = Object.keys(props.getProperties()).filter(k => k.startsWith('schedule_') && !k.endsWith('_trigger'));
    if (remaining.length === 0) { removeSafetyTrigger(); return; }

    const triggers = ScriptApp.getProjectTriggers();
    if (!triggers.some(t => t.getHandlerFunction() === BATCH_TRIGGER_FUNCTION)) {
      ScriptApp.newTrigger(BATCH_TRIGGER_FUNCTION).timeBased().at(new Date(Date.now() + 60000)).create();
      Logger.log('Safety: Created recovery batch trigger.');
    }
  } catch (err) {
    Logger.log('safetyCheckTrigger error: ' + err.message);
  }
}


// ══════��════════════ CANCEL & VIEW SCHEDULED ═══════════���═══════

function cancelAllScheduledEmails() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('⚠️ Cancel All Scheduled Emails', 'Cancel ALL scheduled emails and triggers?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  cleanupBatchTriggers();
  removeSafetyTrigger();

  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  let deletedProps = 0;
  for (const key in allProps) {
    if (key.startsWith('schedule_') && !key.endsWith('_trigger')) {
      props.deleteProperty(key); props.deleteProperty(key + '_trigger');
      updateScheduledDataRow(key, { "Status": "Cancelled", "PropertyExists": false, "LastResult": 'Cancelled @ ' + new Date().toLocaleString() });
      deletedProps++;
    }
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (sheet) {
    const allData = sheet.getDataRange().getValues();
    for (let r = DATA_START_ROW - 1; r < allData.length; r++) {
      if (allData[r][EMAIL_STATUS_COL - 1] && String(allData[r][EMAIL_STATUS_COL - 1]).includes('⏰ Scheduled')) {
        sheet.getRange(r + 1, EMAIL_STATUS_COL).setValue('❌ Cancelled');
      }
    }
  }
  ui.alert('Success!', 'Cancelled ' + deletedProps + ' scheduled email(s).', ui.ButtonSet.OK);
}

function viewScheduledEmails() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys = Object.keys(props).filter(k => k.startsWith('schedule_') && !k.endsWith('_trigger'));
  if (keys.length === 0) { ui.alert('📅 Scheduled Emails', 'No scheduled emails found.', ui.ButtonSet.OK); return; }

  const rows = [];
  for (const k of keys) {
    try {
      const data = JSON.parse(props[k]);
      const sched = data.scheduledAt ? new Date(parseInt(data.scheduledAt, 10)) : null;
      const schedText = sched ? Utilities.formatDate(sched, Session.getScriptTimeZone(), 'MMM dd, yyyy hh:mm a') : 'N/A';
      rows.push('<tr><td>' + (data.email || 'N/A') + '</td><td>' + schedText + '</td><td>' + (data.attempts || 0) + '</td><td>Row ' + (data.row || '?') + '</td></tr>');
    } catch (_) {
      rows.push('<tr><td colspan="4">Error parsing: ' + k + '</td></tr>');
    }
  }

  const html = '<div style="font-family:Arial,sans-serif;padding:15px;"><h2>📅 Scheduled Emails (' + keys.length + ')</h2>' +
    '<p>Daily quota remaining: <b>' + getRemainingDailyQuota() + '</b></p>' +
    '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">' +
    '<tr style="background:#4285f4;color:white;"><th>Email</th><th>Scheduled For</th><th>Attempts</th><th>Source Row</th></tr>' +
    rows.join('') + '</table></div>';

  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(UI_SCHEDULED.w).setHeight(UI_SCHEDULED.h), '📅 Scheduled Emails');
}


// ═════════���═════════ SIGNATURE ═══════════════════

function getDefaultGmailSignature() {
  // 1. Check manually set signature (highest priority)
  try {
    const cached = PropertiesService.getUserProperties().getProperty('CACHED_SIGNATURE');
    if (cached) return cached;
  } catch (_) {}

  // 2. Try Gmail API (advanced service) if enabled
  try {
    if (typeof Gmail !== 'undefined' && Gmail.Users && Gmail.Users.Settings && Gmail.Users.Settings.SendAs) {
      const sendAs = Gmail.Users.Settings.SendAs.list('me');
      if (sendAs && sendAs.sendAs) {
        for (const alias of sendAs.sendAs) {
          if (alias.isDefault && alias.signature) {
            PropertiesService.getUserProperties().setProperty('CACHED_SIGNATURE', alias.signature);
            return alias.signature;
          }
        }
      }
    }
  } catch (_) { /* Gmail advanced service not enabled — fall through */ }

  // 3. Try extracting from recent sent emails
  try {
    const threads = GmailApp.search("from:me", 0, 5);
    for (const thread of threads) {
      const messages = thread.getMessages();
      for (let j = messages.length - 1; j >= 0; j--) {
        const sig = extractSignatureFromBody(messages[j].getBody());
        if (sig && sig.length > 10) {
          PropertiesService.getUserProperties().setProperty('CACHED_SIGNATURE', sig);
          return sig;
        }
      }
    }
  } catch (e) { Logger.log("Signature extraction error: " + e.message); }

  // 4. Try extracting from draft emails
  try {
    const drafts = GmailApp.getDrafts();
    for (let i = 0; i < Math.min(drafts.length, 5); i++) {
      const sig = extractSignatureFromBody(drafts[i].getMessage().getBody());
      if (sig && sig.length > 10) {
        PropertiesService.getUserProperties().setProperty('CACHED_SIGNATURE', sig);
        return sig;
      }
    }
  } catch (e) { Logger.log("Signature draft extraction error: " + e.message); }

  // 5. Fall back to DEFAULT_SIGNATURE constant
  return DEFAULT_SIGNATURE;
}

function extractSignatureFromBody(htmlBody) {
  if (!htmlBody) return "";
  const patterns = [
    /<div dir="ltr" class="gmail_signature"[^>]*>([\s\S]*?)<\/div>/i,
    /<div class="gmail_signature"[^>]*>([\s\S]*?)<\/div>/i,
    /--\s*<br[^>]*>([\s\S]*?)$/i,
    /--\s*<div[^>]*>([\s\S]*?)$/i,
    /<div[^>]*>([\s]*Best regards[\s\S]*?)<\/div>/i,
    /<div[^>]*>([\s]*Regards[\s\S]*?)<\/div>/i,
    /<div[^>]*>([\s]*Thanks[\s\S]*?)<\/div>/i
  ];
  for (const pattern of patterns) {
    const match = htmlBody.match(pattern);
    if (match && match[1]) {
      let sig = match[1].trim()
        .replace(/^(<br[^>]*>|<div[^>]*>|\s)+/i, '')
        .replace(/(<\/div>|<br[^>]*>|\s)+$/i, '');
      if (sig.length > 10) return sig;
    }
  }
  return "";
}

function setupSignature() {
  const ui = SpreadsheetApp.getUi();
  const current = PropertiesService.getUserProperties().getProperty('CACHED_SIGNATURE');
  const hasCustom = current ? 'Current: custom signature set.' : 'Current: using default signature.';
  const result = ui.prompt('Setup Your Email Signature',
    hasCustom + '\n\nPaste your signature below (HTML or plain text).\nLeave empty and click OK to reset to default.',
    ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() == ui.Button.OK) {
    let signature = result.getResponseText();
    if (signature && signature.trim()) {
      if (!signature.match(/<\/?[a-z][\s\S]*>/i)) signature = signature.replace(/\n/g, '<br>');
      PropertiesService.getUserProperties().setProperty('CACHED_SIGNATURE', signature);
      ui.alert('Success!', 'Custom signature saved.', ui.ButtonSet.OK);
    } else {
      PropertiesService.getUserProperties().deleteProperty('CACHED_SIGNATURE');
      ui.alert('Reset!', 'Signature reset to default.\n\nPreview:\n' + stripHtml(DEFAULT_SIGNATURE).trim(), ui.ButtonSet.OK);
    }
  }
}

function clearSignature() {
  PropertiesService.getUserProperties().deleteProperty('CACHED_SIGNATURE');
  SpreadsheetApp.getUi().alert('Signature cache cleared!');
}


// ═══════════════════ PREVIEW ═══════════════════

function previewDraft() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { ui.alert('Error', 'Job Tracker sheet not found.', ui.ButtonSet.OK); return; }
  if (!dataSheet) { ui.alert('Error', 'Data sheet not found.', ui.ButtonSet.OK); return; }

  const row = sheet.getActiveCell().getRow();
  if (row < DATA_START_ROW) { ui.alert("Select a data row (row 3 or below)."); return; }
  const email = sheet.getRange(row, RECRUITER_EMAIL_COL).getValue();
  if (!email) { ui.alert("Missing Recruiter Email in selected row."); return; }

  const allData = sheet.getDataRange().getValues();
  const headers = allData[HEADER_ROW - 1];
  const messageData = getMessageData(dataSheet);
  const signature = getDefaultGmailSignature();
  const pData = getTemplatePersonalizationData(allData[row - 1], headers);
  const subject = personalizeMessage(messageData.subject, pData, true);

  let htmlContent = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:20px;line-height:1.6">' +
    '<h2 style="color:#1a73e8;">Preview for: ' + email + '</h2>' +
    '<p style="color:#555;">Name: ' + (pData.name || 'N/A') + ' | Company: ' + (pData.company || 'N/A') + ' | Role: ' + (pData.role_name || 'N/A') + '</p>';

  const stages = [
    { msg: messageData.initialMsg, label: '📧 Initial Message', color: '#34a853', bg: '#f1f8f4', prefix: '' },
    { msg: messageData.follow1Msg, label: '📧 1st Follow-up', color: '#f9ab00', bg: '#fef7e0', prefix: 'Re: ' },
    { msg: messageData.lastFollowMsg, label: '📧 Last Follow-up', color: '#ea4335', bg: '#fce8e6', prefix: 'Re: ' }
  ];

  for (const stage of stages) {
    if (stage.msg) {
      htmlContent += '<div style="border:2px solid ' + stage.color + ';border-radius:8px;padding:15px;margin-bottom:20px;background:' + stage.bg + '">' +
        '<h3 style="color:' + stage.color + ';margin-top:0;">' + stage.label + '</h3>' +
        '<p><strong>Subject:</strong> ' + stage.prefix + subject + '</p><hr>' +
        '<div>' + personalizeMessage(stage.msg, pData) + (signature || "") + '</div></div>';
    }
  }

  htmlContent += '<hr><p style="font-size:12px;color:#777">Preview only.</p></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(htmlContent).setWidth(UI_PREVIEW.w).setHeight(UI_PREVIEW.h), "📧 Email Preview");
}


// ═══════════════════ SETUP ═══════════════════

function setupSheetHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // Job Tracker: create full header row if missing, or add columns U–Y if partially set up
  let jobSheet = ss.getSheetByName(SHEET_NAME);
  if (!jobSheet) {
    jobSheet = ss.insertSheet(SHEET_NAME);
  }

  // Ensure enough columns exist
  while (jobSheet.getMaxColumns() < NOTES_COL) jobSheet.insertColumnAfter(jobSheet.getMaxColumns());

  const lastCol = jobSheet.getLastColumn() || 0;
  const headerRow = lastCol > 0 ? jobSheet.getRange(HEADER_ROW, 1, 1, Math.max(lastCol, NOTES_COL)).getValues()[0] : [];
  const hasBaseHeaders = headerRow.length >= COMPANY_COL && headerRow[COMPANY_COL - 1] && String(headerRow[COMPANY_COL - 1]).trim() !== '';

  if (!hasBaseHeaders) {
    // Set title row
    jobSheet.getRange(1, 1).setValue("📋 Universal Job Tracker");
    jobSheet.getRange(1, 1).setFontSize(14).setFontWeight("bold").setBackground("#1a73e8").setFontColor("#ffffff");
    if (jobSheet.getMaxColumns() >= 10) jobSheet.getRange(1, 1, 1, 10).merge();

    // Set ALL headers A–Y at row 2
    const allHeaders = [
      "#", "Date Applied", "Company", "Recruiter Name", "Job Title",
      "Recruiter Email", "Location", "Work Mode", "Job Type", "Platform",
      "Source URL", "Status", "Priority", "Salary", "Phone Screen",
      "Interview 1", "Interview 2", "Final Round", "Offer Date", "ATS Score",
      "Email Status", "Schedule Date", "Schedule Time", "Tracking", "Notes"
    ];
    jobSheet.getRange(HEADER_ROW, 1, 1, allHeaders.length).setValues([allHeaders])
      .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff").setHorizontalAlignment("center");

    // Set column widths
    jobSheet.setColumnWidth(NUM_COL, 40);
    jobSheet.setColumnWidth(DATE_APPLIED_COL, 110);
    jobSheet.setColumnWidth(COMPANY_COL, 160);
    jobSheet.setColumnWidth(RECRUITER_NAME_COL, 150);
    jobSheet.setColumnWidth(JOB_TITLE_COL, 180);
    jobSheet.setColumnWidth(RECRUITER_EMAIL_COL, 200);
    jobSheet.setColumnWidth(LOCATION_COL, 120);
    jobSheet.setColumnWidth(WORK_MODE_COL, 100);
    jobSheet.setColumnWidth(JOB_TYPE_COL, 100);
    jobSheet.setColumnWidth(PLATFORM_COL, 100);
    jobSheet.setColumnWidth(SOURCE_URL_COL, 200);
    jobSheet.setColumnWidth(STATUS_COL, 120);
    jobSheet.setColumnWidth(PRIORITY_COL, 80);
    jobSheet.setColumnWidth(SALARY_COL, 100);
    jobSheet.setColumnWidth(PHONE_SCREEN_COL, 110);
    jobSheet.setColumnWidth(INTERVIEW1_COL, 110);
    jobSheet.setColumnWidth(INTERVIEW2_COL, 110);
    jobSheet.setColumnWidth(FINAL_ROUND_COL, 110);
    jobSheet.setColumnWidth(OFFER_DATE_COL, 110);
    jobSheet.setColumnWidth(ATS_SCORE_COL, 80);
    jobSheet.setColumnWidth(EMAIL_STATUS_COL, 220);
    jobSheet.setColumnWidth(SCHEDULE_DATE_COL, 150);
    jobSheet.setColumnWidth(SCHEDULE_TIME_COL, 120);
    jobSheet.setColumnWidth(TRACK_COL, 200);
    jobSheet.setColumnWidth(NOTES_COL, 250);

    // Data validation for dates
    const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Enter date: MM/DD/YYYY').build();
    jobSheet.getRange(DATA_START_ROW, DATE_APPLIED_COL, 1000, 1).setDataValidation(dateRule);
    jobSheet.getRange(DATA_START_ROW, SCHEDULE_DATE_COL, 1000, 1).setDataValidation(dateRule);

    // Data validation for Status dropdown
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Not Applied', 'Applied', 'In Review', 'Phone Screen', 'Interview', 'Final Round', 'Offer', 'Rejected', 'Withdrawn', 'Accepted'], true)
      .setAllowInvalid(true).build();
    jobSheet.getRange(DATA_START_ROW, STATUS_COL, 1000, 1).setDataValidation(statusRule);

    // Data validation for Priority dropdown
    const priorityRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['🔴 High', '🟡 Medium', '🟢 Low'], true)
      .setAllowInvalid(true).build();
    jobSheet.getRange(DATA_START_ROW, PRIORITY_COL, 1000, 1).setDataValidation(priorityRule);

    // Data validation for Work Mode dropdown
    const workModeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Remote', 'On-site', 'Hybrid'], true)
      .setAllowInvalid(true).build();
    jobSheet.getRange(DATA_START_ROW, WORK_MODE_COL, 1000, 1).setDataValidation(workModeRule);

    // Freeze header rows
    jobSheet.setFrozenRows(HEADER_ROW);

  } else {
    // Base headers exist — just ensure U–Y columns are set up
    const needsEmailCols = headerRow.length < EMAIL_STATUS_COL || !headerRow[EMAIL_STATUS_COL - 1] || String(headerRow[EMAIL_STATUS_COL - 1]).trim() === '';
    if (needsEmailCols) {
      while (jobSheet.getMaxColumns() < NOTES_COL) jobSheet.insertColumnAfter(jobSheet.getMaxColumns());
      jobSheet.getRange(HEADER_ROW, EMAIL_STATUS_COL, 1, 5).setValues([["Email Status", "Schedule Date", "Schedule Time", "Tracking", "Notes"]])
        .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");
      jobSheet.setColumnWidth(EMAIL_STATUS_COL, 220);
      jobSheet.setColumnWidth(SCHEDULE_DATE_COL, 150);
      jobSheet.setColumnWidth(SCHEDULE_TIME_COL, 120);
      jobSheet.setColumnWidth(TRACK_COL, 200);
      jobSheet.setColumnWidth(NOTES_COL, 250);

      const dateRule2 = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Enter date: MM/DD/YYYY').build();
      jobSheet.getRange(DATA_START_ROW, SCHEDULE_DATE_COL, 1000, 1).setDataValidation(dateRule2);
    }
  }

  // Data sheet
  let dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!dataSheet) dataSheet = ss.insertSheet(DATA_SHEET_NAME);

  const dataStructure = [
    ["MESSAGE TEMPLATES", ""],
    ["Subject", "Hi {{name}} — Application for {{role_name}} at {{company}}"],
    ["Initial Message", '<p>Hi <b>{{name}}</b>,</p><p>I hope you\'re doing well at <b>{{company}}</b>.</p><p>I recently came across the <b>{{role_name}}</b> position on <b>{{platform}}</b> and would love to express my interest.</p><p>My portfolio is available at {{portfolio_link}}.</p><p>Thank you for your time and consideration.</p>'],
    ["1st Follow-up", "Hi {{name}},\n\nHope you're doing well. I'm just following up on my previous email regarding the {{role_name}} role at {{company}}.\n\nThanks in advance!"],
    ["Last Follow-up", "Hi {{name}},\n\nJust following up one last time regarding the {{role_name}} position at {{company}}.\n\nLooking forward to your reply!"]
  ];
  dataSheet.getRange(1, 1, dataStructure.length, 2).setValues(dataStructure);
  dataSheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#34a853").setFontColor("#ffffff").setFontSize(12);
  dataSheet.getRange(2, 1, dataStructure.length - 1, 1).setFontWeight("bold").setBackground("#d9ead3").setVerticalAlignment("top");
  dataSheet.getRange(2, 2, dataStructure.length - 1, 1).setVerticalAlignment("top").setWrap(true);
  dataSheet.setColumnWidth(1, 150);
  dataSheet.setColumnWidth(2, 700);

  const hintRow = dataStructure.length + 2;
  dataSheet.getRange(hintRow, 1).setValue("PERSONALIZATION TAGS");
  dataSheet.getRange(hintRow, 2).setValue("Available: {{name}}, {{company}}, {{role_name}}, {{email}}, {{location}}, {{platform}}, {{portfolio_link}} — or any column header from Job Tracker");
  dataSheet.getRange(hintRow, 1, 1, 2).setFontWeight("bold").setBackground("#fff2cc").setFontStyle("italic");

  initEmailLogSheet();

  ui.alert('Success!', 'Setup complete:\n- Job Tracker headers (A–Y) configured\n- Data sheet created with templates\n- Email Log sheet created', ui.ButtonSet.OK);
}


// ════���══════════════ TRACKING SETUP ════���══════════════

function setupTracking() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt('🔗 Setup Open/Click Tracking',
    'Deploy this script as a web app first:\n1. Deploy > New deployment > Web app\n2. Execute as: Me, Access: Anyone\n3. Paste the URL here:',
    ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() == ui.Button.OK) {
    const url = result.getResponseText().trim();
    if (url && url.startsWith('https://')) {
      PropertiesService.getScriptProperties().setProperty(WEBAPP_URL_KEY, url);
      ui.alert('Success!', 'Tracking URL saved.', ui.ButtonSet.OK);
    } else {
      ui.alert('Invalid URL. Must start with https://');
    }
  }
}

function disableTracking() {
  PropertiesService.getScriptProperties().deleteProperty(WEBAPP_URL_KEY);
  SpreadsheetApp.getUi().alert('Tracking disabled.');
}


// ═══════════════════ CONTACTS ═══════════════════

function importContactsForEmail() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const contactsSheet = ss.getSheetByName(CONTACTS_SHEET_NAME);
  const jobSheet = ss.getSheetByName(SHEET_NAME);
  if (!contactsSheet) { ui.alert('Error', 'Contacts sheet not found.', ui.ButtonSet.OK); return; }
  if (!jobSheet) { ui.alert('Error', 'Job Tracker sheet not found.', ui.ButtonSet.OK); return; }

  const contactData = contactsSheet.getDataRange().getValues();
  if (contactData.length < 3) { ui.alert('No contacts found.'); return; }

  // Collect all sheet rows (0-indexed) with valid emails
  const validSheetRows = [];
  for (let i = 2; i < contactData.length; i++) {
    const cEmail = String(contactData[i][CONTACT_EMAIL_COL - 1] || '').trim();
    if (cEmail && isValidEmail(cEmail)) {
      validSheetRows.push(i); // 0-indexed into contactData
    }
  }

  if (validSheetRows.length === 0) { ui.alert('No contacts with valid emails found.'); return; }

  // Import ALL contacts directly — no selection dialog
  try {
    const result = doImportAllContacts_(jobSheet, contactData, validSheetRows);
    ui.alert('📥 Import Complete', result, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Error', 'Import failed: ' + e.message, ui.ButtonSet.OK);
  }
}

/**
 * Imports contacts directly from contactData using the provided row indices.
 * No ScriptProperties needed — avoids the 9KB limit with 2000+ contacts.
 */
function doImportAllContacts_(jobSheet, contactData, validSheetRows) {
  const IMPORT_BATCH_SIZE = 50;
  const totalCols = NOTES_COL;
  let imported = 0;
  let lastRow = jobSheet.getLastRow();
  if (lastRow < DATA_START_ROW - 1) lastRow = DATA_START_ROW - 1;
  const startNum = lastRow >= DATA_START_ROW ? lastRow - DATA_START_ROW + 2 : 1;

  for (let batchStart = 0; batchStart < validSheetRows.length; batchStart += IMPORT_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + IMPORT_BATCH_SIZE, validSheetRows.length);
    const batchData = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const srcRow = validSheetRows[i];
      if (srcRow < 0 || srcRow >= contactData.length) continue;

      const cData = contactData[srcRow];
      const row = new Array(totalCols).fill('');
      row[NUM_COL - 1] = startNum + imported + (i - batchStart);           // A = #
      // B = Date Applied — left empty for user to fill in manually
      row[COMPANY_COL - 1] = String(cData[CONTACT_COMPANY_COL - 1] || '');  // C = Company
      row[JOB_TITLE_COL - 1] = String(cData[CONTACT_ROLE_COL - 1] || '');   // D = Job Title (from Role)
      row[PLATFORM_COL - 1] = String(cData[CONTACT_PLATFORM_COL - 1] || ''); // H = Platform
      row[SOURCE_URL_COL - 1] = String(cData[CONTACT_LINKEDIN_COL - 1] || ''); // I = Source URL (LinkedIn)
      row[STATUS_COL - 1] = 'Not Applied';                                  // J = Status
      row[RECRUITER_NAME_COL - 1] = String(cData[CONTACT_NAME_COL - 1] || ''); // M = Recruiter Name
      row[RECRUITER_EMAIL_COL - 1] = String(cData[CONTACT_EMAIL_COL - 1] || ''); // N = Recruiter Email
      row[NOTES_COL - 1] = cData[CONTACT_PHONE_COL - 1] ? 'Phone: ' + String(cData[CONTACT_PHONE_COL - 1]) : ''; // Y = Notes
      row[EMAIL_STATUS_COL - 1] = 'Imported from Contacts';                 // U = Email Status
      batchData.push(row);
    }

    if (batchData.length > 0) {
      jobSheet.getRange(lastRow + 1, 1, batchData.length, totalCols).setValues(batchData);
      lastRow += batchData.length;
      imported += batchData.length;
      SpreadsheetApp.flush();
      if (batchEnd < validSheetRows.length) Utilities.sleep(500);
    }
  }

  return 'Imported ' + imported + ' contact(s) to Job Tracker with Name, Company, Role, Email, LinkedIn, Phone, and Platform.';
}

/**
 * Legacy doImportContacts — kept for backward compatibility if called from old HTML dialogs.
 */
function doImportContacts(selectedIndices) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jobSheet = ss.getSheetByName(SHEET_NAME);
  const contactsSheet = ss.getSheetByName(CONTACTS_SHEET_NAME);
  if (!jobSheet) throw new Error('Job Tracker sheet not found.');
  if (!contactsSheet) throw new Error('Contacts sheet not found.');

  const storedRows = PropertiesService.getScriptProperties().getProperty('IMPORT_CONTACT_ROWS');
  if (!storedRows) throw new Error('Contact mapping not found. Reopen the import dialog.');
  const contactRowNumbers = JSON.parse(storedRows);

  const sheetRows = selectedIndices
    .filter(function(idx) { return idx >= 0 && idx < contactRowNumbers.length; })
    .map(function(idx) { return contactRowNumbers[idx] - 1; }); // Convert to 0-indexed
  if (sheetRows.length === 0) throw new Error('No valid contacts to import.');

  const contactData = contactsSheet.getDataRange().getValues();
  const result = doImportAllContacts_(jobSheet, contactData, sheetRows);

  try { PropertiesService.getScriptProperties().deleteProperty('IMPORT_CONTACT_ROWS'); } catch (_) {}
  return result;
}

function emailSelectedContacts() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const contactsSheet = ss.getSheetByName(CONTACTS_SHEET_NAME);
  if (!contactsSheet) { ui.alert('Error', 'Contacts sheet not found.', ui.ButtonSet.OK); return; }
  if (ss.getActiveSheet().getName() !== CONTACTS_SHEET_NAME) {
    ui.alert('Error', 'Please select rows in the Contacts sheet first.', ui.ButtonSet.OK); return;
  }
  const selection = contactsSheet.getActiveRange();
  if (!selection) { ui.alert('Please select rows to email.'); return; }
  if (selection.getRow() < 3) { ui.alert('Please select data rows (row 3 or below).'); return; }

  // Store selection range before opening dialog (dialog loses active range context)
  PropertiesService.getScriptProperties().setProperty('CONTACT_SEL_START', String(selection.getRow()));
  PropertiesService.getScriptProperties().setProperty('CONTACT_SEL_COUNT', String(selection.getNumRows()));

  showTemplatePicker_('contacts');
}

/**
 * Called from templatePickerCallback_ — safe for google.script.run context.
 * Reads stored selection range instead of getActiveRange().
 */
function emailSelectedContacts_fromCallback_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const contactsSheet = ss.getSheetByName(CONTACTS_SHEET_NAME);
  const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!contactsSheet || !dataSheet) throw new Error('Required sheet not found.');

  // Read stored selection (saved before dialog opened)
  const selStart = parseInt(PropertiesService.getScriptProperties().getProperty('CONTACT_SEL_START') || '0', 10);
  const selCount = parseInt(PropertiesService.getScriptProperties().getProperty('CONTACT_SEL_COUNT') || '0', 10);
  if (selStart < 3 || selCount < 1) throw new Error('No contact selection found. Select rows in Contacts sheet and try again.');

  // Cleanup stored selection
  try {
    PropertiesService.getScriptProperties().deleteProperty('CONTACT_SEL_START');
    PropertiesService.getScriptProperties().deleteProperty('CONTACT_SEL_COUNT');
  } catch (_) {}

  const contactData = contactsSheet.getDataRange().getValues();
  const messageData = getMessageData(dataSheet);
  const signature = getDefaultGmailSignature();
  let processed = 0, skipped = 0, errors = 0;

  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');

  const startRow = selStart - 1; // Convert to 0-indexed
  const endRow = Math.min(startRow + selCount, contactData.length);

  for (let r = startRow; r < endRow; r++) {
    if (isDraftStopRequested_()) { break; }
    if (processed >= MAX_DRAFTS_PER_RUN) { break; }

    const cEmail = String(contactData[r][CONTACT_EMAIL_COL - 1] || '').trim();
    if (!cEmail || !isValidEmail(cEmail)) { skipped++; continue; }

    try {
      const pData = {
        email: cEmail, name: String(contactData[r][CONTACT_NAME_COL - 1] || '').trim(),
        company: String(contactData[r][CONTACT_COMPANY_COL - 1] || '').trim(),
        role_name: String(contactData[r][CONTACT_ROLE_COL - 1] || '').trim(),
        location: '', platform: '', warmth: String(contactData[r][CONTACT_WARMTH_COL - 1] || '').trim()
      };
      try {
        const props = PropertiesService.getScriptProperties();
        pData.portfolio_link = props.getProperty('USER_PORTFOLIO_LINK') || 'https://your-portfolio.com';
        if (!pData.role_name) pData.role_name = props.getProperty('DEFAULT_ROLE_NAME') || '[Role Name]';
      } catch (_) { pData.portfolio_link = 'https://your-portfolio.com'; }

      const subject = personalizeMessage(messageData.subject, pData, true);
      const finalBody = personalizeMessage(messageData.initialMsg, pData) + (signature || "");
      GmailApp.createDraft(cEmail, subject, stripHtml(finalBody), { htmlBody: finalBody });
      processed++;
      Utilities.sleep(getRandomDelay());
    } catch (err) {
      errors++;
      Logger.log('Contact email error for ' + cEmail + ': ' + err.message);
    }
  }

  PropertiesService.getScriptProperties().deleteProperty('STOP_DRAFTS');
  Logger.log('Contact drafts complete: created=' + processed + ', skipped=' + skipped + ', errors=' + errors);
}


// ═══════════════════ MENU ═══════════════════

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu(MENU_NAME)
    .addItem("✨ Setup Sheet Headers", "setupSheetHeaders")
    .addSeparator()
    .addSubMenu(ui.createMenu("📋 Email Templates")
      .addItem("🔍 Template Selector (All Templates)", "showTemplateSelector")
      .addSeparator()
      .addItem("📄 SEO — Job Application", "loadTemplateSEOJob")
      .addItem("📄 Performance Marketing — Job Application", "loadTemplatePerfMarketingJob")
      .addItem("📄 Growth Marketing — Job Application", "loadTemplateGrowthJob")
      .addSeparator()
      .addItem("🎯 SEO — Cold Outreach", "loadTemplateSEOOutreach")
      .addItem("🎯 Growth Marketing — Cold Outreach", "loadTemplateGrowthOutreach"))
    .addSeparator()
    .addItem("🧪 Create Single Test Draft", "createSingleTestDraft")
    .addItem("📧 Create Drafts - New Emails (Initial)", "createDraftsForNewEmails")
    .addItem("📧 Create Drafts - Pick Template First", "createDraftsWithTemplatePicker")
    .addItem("🔄 Create Drafts - Follow-ups (Same Thread)", "createDraftsForSentEmails")
    .addItem("🛑 Stop Creating Drafts", "stopCreatingDrafts")
    .addItem("▶️ Resume Creating Drafts", "resumeCreatingDrafts")
    .addSeparator()
    .addItem("⏰ Schedule Emails", "scheduleEmails")
    .addItem("📅 View Scheduled Emails", "viewScheduledEmails")
    .addItem("❌ Cancel All Scheduled Emails", "cancelAllScheduledEmails")
    .addSeparator()
    .addItem("🧪 Dry Run — Preview All", "dryRunEmails")
    .addItem("👁️ Preview Selected Row", "previewDraft")
    .addSeparator()
    .addSubMenu(ui.createMenu("👥 Contacts")
      .addItem("📥 Import Contacts for Email", "importContactsForEmail")
      .addItem("📧 Email Selected Contacts", "emailSelectedContacts"))
    .addSeparator()
    .addItem("📊 Check Bounces", "checkBounces")
    .addItem("📈 Daily Send Stats", "showDailySendStats")
    .addSeparator()
    .addSubMenu(ui.createMenu("🔧 Tracking")
      .addItem("🔗 Setup Tracking (Web App URL)", "setupTracking")
      .addItem("🚫 Disable Tracking", "disableTracking"))
    .addSubMenu(ui.createMenu("✍️ Signature")
      .addItem("Setup Signature Manually", "setupSignature")
      .addItem("Test Signature Fetch", "testSignatureFetch")
      .addItem("Clear Cached Signature", "clearSignature"))
    .addSubMenu(ui.createMenu("🔧 Debug")
      .addItem("🧪 Run Full Diagnostic", "runFullDiagnostic")
      .addSeparator()
      .addItem("Test Permissions", "testPermissions")
      .addItem("Test Email Search", "testEmailSearch")
      .addItem("Verify Data Sheet", "verifyDataSheetMessages")
      .addItem("List Schedule Properties", "listScheduledProperties")
      .addItem("Show Project Triggers", "showProjectTriggers")
      .addItem("Force Run Batch Now", "forceRunBatchNow")
      .addItem("Force Send All Due Now", "forceSendAllDueNow")
      .addItem("Cleanup All Triggers", "cleanupOldBatchTriggers"))
    .addToUi();
}


// ═══════════════════ DAILY STATS ════════��══════════

function showDailySendStats() {
  const ui = SpreadsheetApp.getUi();
  const sent = getDailySendCount();
  const remaining = getRemainingDailyQuota();
  const scheduledCount = Object.keys(PropertiesService.getScriptProperties().getProperties())
    .filter(k => k.startsWith('schedule_') && !k.endsWith('_trigger')).length;
  ui.alert('📈 Daily Send Statistics',
    'Sent today: ' + sent + '\nRemaining: ' + remaining + '\nDaily limit: ' + DAILY_SEND_LIMIT + '\nPending scheduled: ' + scheduledCount,
    ui.ButtonSet.OK);
}


// ═══════════════════ DEBUG / TEST ══════════���════════

function testPermissions() {
  const ui = SpreadsheetApp.getUi();
  const results = [];
  try { SpreadsheetApp.getActiveSpreadsheet(); results.push("✅ Sheets: OK"); } catch (e) { results.push("❌ Sheets: " + e.message); }
  try { results.push("✅ Gmail: OK (" + GmailApp.getDrafts().length + " drafts)"); } catch (e) { results.push("❌ Gmail: " + e.message); }
  try {
    PropertiesService.getUserProperties().setProperty('TEST_PERM', 'OK');
    results.push(PropertiesService.getUserProperties().getProperty('TEST_PERM') === 'OK' ? "✅ Storage: OK" : "❌ Storage: Failed");
  } catch (e) { results.push("❌ Storage: " + e.message); }

  const webAppUrl = PropertiesService.getScriptProperties().getProperty(WEBAPP_URL_KEY);
  results.push(webAppUrl ? '✅ Tracking: Configured' : "⚠️ Tracking: Not configured");
  results.push('📊 Daily sends: ' + getDailySendCount() + '/' + DAILY_SEND_LIMIT);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  results.push(ss.getSheetByName(SHEET_NAME) ? '✅ Job Tracker: Found' : '❌ Job Tracker: Missing');
  results.push(ss.getSheetByName(CONTACTS_SHEET_NAME) ? '✅ Contacts: Found' : '⚠️ Contacts: Not found');
  results.push(ss.getSheetByName(DATA_SHEET_NAME) ? '✅ Data: Found' : '❌ Data: Missing');
  ui.alert("Permission Test Results", results.join("\n\n"), ui.ButtonSet.OK);
}

function testSignatureFetch() {
  const sig = getDefaultGmailSignature();
  const ui = SpreadsheetApp.getUi();
  if (sig) ui.alert("✅ Signature Found!", "Preview:\n" + stripHtml(sig).substring(0, 200) + "...", ui.ButtonSet.OK);
  else ui.alert("❌ No Signature Found", "Use 'Setup Signature Manually'.", ui.ButtonSet.OK);
}

function testEmailSearch() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) { ui.alert('Error', 'Job Tracker not found.', ui.ButtonSet.OK); return; }
  const row = sheet.getActiveCell().getRow();
  if (row < DATA_START_ROW) { ui.alert("Select a data row (row 3+)."); return; }
  const email = sheet.getRange(row, RECRUITER_EMAIL_COL).getValue();
  if (!email) { ui.alert("No recruiter email in selected row."); return; }

  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  const messageData = dataSheet ? getMessageData(dataSheet) : { subject: '' };
  const results = ['Testing email search for: ' + email + '\n'];

  try {
    const threads1 = GmailApp.search('to:' + email + ' subject:"' + messageData.subject + '" in:sent', 0, 3);
    results.push('Query 1 (with subject): ' + threads1.length + ' thread(s)');
    for (const t of threads1) results.push('  — "' + t.getFirstMessageSubject() + '" (' + t.getMessageCount() + ' msgs)');
  } catch (e) { results.push('Query 1 error: ' + e.message); }

  try {
    const threads2 = GmailApp.search('to:' + email + ' in:sent', 0, 5);
    results.push('\nQuery 2 (any sent): ' + threads2.length + ' thread(s)');
    for (const t of threads2) results.push('  — "' + t.getFirstMessageSubject() + '" (' + t.getMessageCount() + ' msgs)');
  } catch (e) { results.push('Query 2 error: ' + e.message); }

  ui.alert("🔍 Email Search Test", results.join("\n"), ui.ButtonSet.OK);
}

function verifyDataSheetMessages() {
  const ui = SpreadsheetApp.getUi();
  const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET_NAME);
  if (!dataSheet) { ui.alert("Error", "Data sheet not found. Run Setup first.", ui.ButtonSet.OK); return; }
  try {
    const messageData = getMessageData(dataSheet);
    const results = ["📋 DATA SHEET VERIFICATION\n─────────────────────────────────"];
    const checks = [
      { label: "✉️ Subject", value: messageData.subject, cell: "B2" },
      { label: "📧 Initial Message", value: messageData.initialMsg, cell: "B3" },
      { label: "🔄 1st Follow-up", value: messageData.follow1Msg, cell: "B4" },
      { label: "🔚 Last Follow-up", value: messageData.lastFollowMsg, cell: "B5" }
    ];
    for (const c of checks) {
      if (c.value && c.value.trim()) {
        results.push('\n' + c.label + ': ✅ "' + c.value.substring(0, 80) + '..." (' + c.value.length + ' chars)');
        const tags = c.value.match(/\{\{[^}]+\}\}/g);
        if (tags) results.push('   Tags: ' + tags.join(', '));
      } else {
        results.push('\n' + c.label + ': ❌ EMPTY — add in cell ' + c.cell);
      }
    }
    results.push("\n─────────────────────────────────");
    results.push("💡 Tags: {{name}}, {{company}}, {{role_name}}, {{email}}, {{location}}, {{platform}}, {{portfolio_link}}");

    ui.showModalDialog(HtmlService.createHtmlOutput(
      '<div style="font-family:monospace;white-space:pre-wrap;padding:15px;font-size:13px;">' + results.join("\n") + '</div>'
    ).setWidth(UI_VERIFY.w).setHeight(UI_VERIFY.h), "📋 Data Sheet Verification");
  } catch (e) {
    ui.alert("Error", "Could not read Data sheet: " + e.message, ui.ButtonSet.OK);
  }
}

function listScheduledProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys = Object.keys(props).filter(k => k.startsWith('schedule_') && !k.endsWith('_trigger'));
  if (keys.length === 0) { SpreadsheetApp.getUi().alert('No schedule_ properties found.'); return; }
  const out = keys.map(k => {
    try {
      const data = JSON.parse(props[k]);
      const sched = data.scheduledAt ? new Date(parseInt(data.scheduledAt, 10)) : null;
      return { key: k, email: data.email, scheduledAt: sched ? Utilities.formatDate(sched, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : 'N/A', row: data.row || '' };
    } catch (_) { return { key: k, error: 'PARSE_ERROR' }; }
  });
  Logger.log(JSON.stringify(out, null, 2));
  SpreadsheetApp.getUi().alert('Listed ' + out.length + ' schedule_ properties. Check Logs.');
}

function showProjectTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) { SpreadsheetApp.getUi().alert('No triggers found.'); return; }
  Logger.log(JSON.stringify(triggers.map(t => ({ handler: t.getHandlerFunction(), id: t.getUniqueId ? t.getUniqueId() : '' })), null, 2));
  SpreadsheetApp.getUi().alert('Found ' + triggers.length + ' triggers. Check Logs.');
}

function forceRunBatchNow() {
  try { sendScheduledEmailBatch(); SpreadsheetApp.getUi().alert('Batch executed. Check Logs.'); }
  catch (e) { SpreadsheetApp.getUi().alert('Error: ' + e.message); }
}

function forceSendAllDueNow() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const keys = Object.keys(all).filter(k => k.startsWith('schedule_') && !k.endsWith('_trigger'));
  if (keys.length === 0) { SpreadsheetApp.getUi().alert('No schedule_ items found.'); return; }

  const remaining = getRemainingDailyQuota();
  if (remaining <= 0) { SpreadsheetApp.getUi().alert('Daily limit reached.'); return; }

  const now = Date.now();
  const TOL = 5 * 60 * 1000;
  let sent = 0, skipped = 0;

  for (const k of keys) {
    if (sent >= remaining) { skipped++; continue; }
    try {
      const obj = JSON.parse(props.getProperty(k));
      const sched = obj.scheduledAt ? parseInt(obj.scheduledAt, 10) : 0;
      if (sched <= now + TOL) {
        try {
          let finalBody = obj.message + (obj.signature || "");
          const tracking = injectTracking(finalBody, obj.email, obj.row);
          finalBody = tracking.body;
          GmailApp.sendEmail(obj.email, obj.subject, stripHtml(finalBody), { htmlBody: finalBody });
          incrementDailySendCount(1);
          const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
          if (sheet && obj.row) sheet.getRange(obj.row, EMAIL_STATUS_COL).setValue('✅ Sent (forced) ' + new Date().toLocaleString());
          sent++;
          props.deleteProperty(k); props.deleteProperty(k + '_trigger');
          updateScheduledDataRow(k, { "Status": "Sent", "PropertyExists": false, "Attempts": (parseInt(getScheduledDataValue(k, 'Attempts') || 0, 10) + 1), "LastResult": new Date().toLocaleString() });
        } catch (sendErr) { Logger.log('force send failed: ' + sendErr.message); }
      } else { skipped++; }
    } catch (_) {}
  }

  SpreadsheetApp.getUi().alert('Force run complete.\nSent: ' + sent + '\nSkipped: ' + skipped + '\nRemaining quota: ' + getRemainingDailyQuota());
}


// ═════���═════════════ PROPERTIES CLEANUP ═══════════════════

/**
 * Periodically clean old tracking entries from ScriptProperties to avoid 9KB limit.
 * Call manually or from a weekly trigger.
 */
function cleanupOldTrackingProperties() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  let deleted = 0;

  for (const key in all) {
    if (key.startsWith('track_')) {
      try {
        const data = JSON.parse(all[key]);
        if (data.created && (now - new Date(data.created).getTime()) > MAX_AGE_MS) {
          props.deleteProperty(key);
          deleted++;
        }
      } catch (_) {
        props.deleteProperty(key); // corrupted entry
        deleted++;
      }
    }
  }
  Logger.log('cleanupOldTrackingProperties: deleted ' + deleted + ' entries.');
}


// ═══════════════════ FULL DIAGNOSTIC TEST ═══════════════════

function runFullDiagnostic() {
  const results = [];
  let passCount = 0, failCount = 0, warnCount = 0;

  function pass(name, detail) { results.push({ status: 'PASS', name: name, detail: detail || '' }); passCount++; }
  function fail(name, detail) { results.push({ status: 'FAIL', name: name, detail: detail || '' }); failCount++; }
  function warn(name, detail) { results.push({ status: 'WARN', name: name, detail: detail || '' }); warnCount++; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── TEST 1: Sheet existence ──
  try {
    const sheetChecks = [
      { name: SHEET_NAME, required: true },
      { name: CONTACTS_SHEET_NAME, required: false },
      { name: DATA_SHEET_NAME, required: true },
      { name: EMAIL_LOG_SHEET_NAME, required: false }
    ];
    let allFound = true;
    for (const sc of sheetChecks) {
      const s = ss.getSheetByName(sc.name);
      if (!s) {
        if (sc.required) { fail('Sheet: ' + sc.name, 'Required sheet not found. Run Setup Sheet Headers.'); allFound = false; }
        else { warn('Sheet: ' + sc.name, 'Optional sheet not found.'); allFound = false; }
      }
    }
    if (allFound) pass('Sheet Existence', 'All 4 sheets found.');
    else if (failCount === 0) pass('Sheet Existence', 'Required sheets found, some optional missing.');
  } catch (e) { fail('Sheet Existence', e.message); }

  // ── TEST 2: Job Tracker headers ──
  try {
    const jobSheet = ss.getSheetByName(SHEET_NAME);
    if (!jobSheet) { fail('Job Tracker Headers', 'Sheet not found.'); }
    else {
      const expectedHeaders = [
        '#', 'Date Applied', 'Company', 'Recruiter Name', 'Job Title',
        'Recruiter Email', 'Location', 'Work Mode', 'Job Type', 'Platform',
        'Source URL', 'Status', 'Priority', 'Salary', 'Phone Screen',
        'Interview 1', 'Interview 2', 'Final Round', 'Offer Date', 'ATS Score',
        'Email Status', 'Schedule Date', 'Schedule Time', 'Tracking', 'Notes'
      ];
      const lastCol = Math.max(jobSheet.getLastColumn(), NOTES_COL);
      const headerRow = jobSheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
      const mismatches = [];
      for (let c = 0; c < expectedHeaders.length; c++) {
        const actual = String(headerRow[c] || '').trim();
        if (actual !== expectedHeaders[c]) mismatches.push('Col ' + String.fromCharCode(65 + c) + ': expected "' + expectedHeaders[c] + '" got "' + actual + '"');
      }
      if (mismatches.length === 0) pass('Job Tracker Headers', 'All 25 headers (A-Y) match.');
      else fail('Job Tracker Headers', mismatches.join('; '));
    }
  } catch (e) { fail('Job Tracker Headers', e.message); }

  // ── TEST 3: Contacts headers ──
  try {
    const contactsSheet = ss.getSheetByName(CONTACTS_SHEET_NAME);
    if (!contactsSheet) { warn('Contacts Headers', 'Contacts sheet not found (optional).'); }
    else {
      const expectedContacts = ['Name', 'Company', 'Role / Title', 'Email', 'LinkedIn', 'Phone', 'Platform Met', 'Last Contact', 'Warmth', 'Notes'];
      const lastCol = Math.max(contactsSheet.getLastColumn(), CONTACT_NOTES_COL);
      const headerRow = contactsSheet.getRange(2, 1, 1, lastCol).getValues()[0];
      const mismatches = [];
      for (let c = 0; c < expectedContacts.length; c++) {
        const actual = String(headerRow[c] || '').trim();
        if (actual !== expectedContacts[c] && actual.toLowerCase() !== expectedContacts[c].toLowerCase()) {
          mismatches.push('Col ' + String.fromCharCode(65 + c) + ': expected "' + expectedContacts[c] + '" got "' + actual + '"');
        }
      }
      if (mismatches.length === 0) pass('Contacts Headers', 'All 10 headers (A-J) match.');
      else warn('Contacts Headers', 'Minor differences: ' + mismatches.join('; '));
    }
  } catch (e) { fail('Contacts Headers', e.message); }

  // ── TEST 4: Data sheet templates ──
  try {
    const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
    if (!dataSheet) { fail('Data Sheet Templates', 'Data sheet not found.'); }
    else {
      const messageData = getMessageData(dataSheet);
      const checks = [];
      if (!messageData.subject) checks.push('Subject (B2) is empty');
      if (!messageData.initialMsg) checks.push('Initial Message (B3) is empty');
      if (!messageData.follow1Msg) checks.push('1st Follow-up (B4) is empty');
      if (!messageData.lastFollowMsg) checks.push('Last Follow-up (B5) is empty');
      if (checks.length === 0) pass('Data Sheet Templates', 'All 4 templates have content. Subject: "' + messageData.subject.substring(0, 50) + '..."');
      else if (!messageData.subject || !messageData.initialMsg) fail('Data Sheet Templates', checks.join('; '));
      else warn('Data Sheet Templates', checks.join('; '));
    }
  } catch (e) { fail('Data Sheet Templates', e.message); }

  // ── TEST 5: Email Log headers ──
  try {
    const logSheet = ss.getSheetByName(EMAIL_LOG_SHEET_NAME);
    if (!logSheet) { warn('Email Log Headers', 'Email Log sheet not found. Will be created on first schedule.'); }
    else {
      const row1 = logSheet.getRange(1, 1, 1, 20).getValues()[0];
      if (String(row1[0]).trim() === 'ScheduleId' && String(row1[11]).trim() === 'RunTimestamp') {
        pass('Email Log Headers', 'Schedule headers (A-J) and Log headers (L-T) correct.');
      } else {
        fail('Email Log Headers', 'Header mismatch. A1="' + row1[0] + '", L1="' + row1[11] + '"');
      }
    }
  } catch (e) { fail('Email Log Headers', e.message); }

  // ── TEST 6: Column constants bounds ──
  try {
    const maxCol = NOTES_COL;
    const consts = { NUM_COL:NUM_COL, DATE_APPLIED_COL:DATE_APPLIED_COL, COMPANY_COL:COMPANY_COL,
      RECRUITER_NAME_COL:RECRUITER_NAME_COL, JOB_TITLE_COL:JOB_TITLE_COL, RECRUITER_EMAIL_COL:RECRUITER_EMAIL_COL,
      LOCATION_COL:LOCATION_COL, STATUS_COL:STATUS_COL, EMAIL_STATUS_COL:EMAIL_STATUS_COL,
      SCHEDULE_DATE_COL:SCHEDULE_DATE_COL, TRACK_COL:TRACK_COL, NOTES_COL:NOTES_COL };
    const bad = [];
    for (const k in consts) {
      if (consts[k] < 1 || consts[k] > maxCol) bad.push(k + '=' + consts[k]);
    }
    if (bad.length === 0) pass('Column Constants', 'All column constants in valid range (1-' + maxCol + ').');
    else fail('Column Constants', 'Out of range: ' + bad.join(', '));
  } catch (e) { fail('Column Constants', e.message); }

  // ── TEST 7: Permissions — Sheets ──
  try {
    const name = ss.getName();
    pass('Permission: Sheets', 'Access OK. Spreadsheet: "' + name + '"');
  } catch (e) { fail('Permission: Sheets', e.message); }

  // ── TEST 8: Permissions — Gmail ──
  try {
    const draftCount = GmailApp.getDrafts().length;
    pass('Permission: Gmail', 'Access OK. Current drafts: ' + draftCount);
  } catch (e) { fail('Permission: Gmail', 'Gmail access denied — reauthorize. ' + e.message); }

  // ── TEST 9: Permissions — Properties ──
  try {
    const testKey = '_DIAG_TEST_' + Date.now();
    PropertiesService.getScriptProperties().setProperty(testKey, 'ok');
    const val = PropertiesService.getScriptProperties().getProperty(testKey);
    PropertiesService.getScriptProperties().deleteProperty(testKey);
    PropertiesService.getUserProperties().setProperty(testKey, 'ok');
    PropertiesService.getUserProperties().deleteProperty(testKey);
    if (val === 'ok') pass('Permission: Properties', 'ScriptProperties + UserProperties read/write OK.');
    else fail('Permission: Properties', 'Write succeeded but read returned: ' + val);
  } catch (e) { fail('Permission: Properties', e.message); }

  // ── TEST 10: Permissions — Triggers ──
  try {
    const triggers = ScriptApp.getProjectTriggers();
    pass('Permission: Triggers', 'Access OK. Active triggers: ' + triggers.length);
  } catch (e) { fail('Permission: Triggers', e.message); }

  // ── TEST 11: Email validation ──
  try {
    const goodEmails = ['test@example.com', 'user+tag@gmail.com', 'a@b.co', 'name@sub.domain.org'];
    const badEmails = ['', 'bad@', '@bad.com', 'no spaces@x.com', 'missing.at.sign'];
    let passed_count = 0, failed_tests = [];
    for (const e of goodEmails) { if (isValidEmail(e)) passed_count++; else failed_tests.push('"' + e + '" should be valid'); }
    for (const e of badEmails) { if (!isValidEmail(e)) passed_count++; else failed_tests.push('"' + e + '" should be invalid'); }
    if (failed_tests.length === 0) pass('Email Validation', passed_count + '/' + (goodEmails.length + badEmails.length) + ' cases passed.');
    else fail('Email Validation', failed_tests.join('; '));
  } catch (e) { fail('Email Validation', e.message); }

  // ── TEST 12: Personalization engine ──
  try {
    const sample = { name: 'John', company: 'Acme Corp', role_name: 'SEO Manager', email: 'john@acme.com' };
    const r1 = personalizeMessage('Hi {{name}} at {{company}}', sample, true);
    const r2 = personalizeMessage('Role: {{ role_name }}', sample, true);
    const r3 = personalizeMessage('{{unknown_tag}}', sample, true);
    const issues = [];
    if (r1 !== 'Hi John at Acme Corp') issues.push('Basic replacement failed: "' + r1 + '"');
    if (!r2.includes('SEO Manager')) issues.push('Spaced tag failed: "' + r2 + '"');
    if (r3 !== '{{unknown_tag}}') issues.push('Unknown tag should stay: "' + r3 + '"');
    if (issues.length === 0) pass('Personalization Engine', '3/3 tests passed. Tags, spaces, unknowns handled.');
    else fail('Personalization Engine', issues.join('; '));
  } catch (e) { fail('Personalization Engine', e.message); }

  // ── TEST 13: Date/time parsing ──
  try {
    const d = new Date(2025, 0, 15);
    const tests = [
      [d, '09:30 AM', 9, 30], [d, '12:00 PM', 12, 0], [d, '12:00 AM', 0, 0],
      [d, '11:59 PM', 23, 59], [d, '14:30', 14, 30], ['not-a-date', '09:00', null, null]
    ];
    let ok = 0, issues = [];
    for (const t of tests) {
      const r = combineDateAndTime_(t[0], t[1]);
      if (t[2] === null) { if (r === null) ok++; else issues.push('"' + t[1] + '" should return null'); }
      else { if (r && r.getHours() === t[2] && r.getMinutes() === t[3]) ok++; else issues.push('"' + t[1] + '" => ' + (r ? r.getHours() + ':' + r.getMinutes() : 'null') + ' expected ' + t[2] + ':' + t[3]); }
    }
    if (issues.length === 0) pass('Date/Time Parsing', ok + '/6 cases passed (AM/PM/24hr/null).');
    else fail('Date/Time Parsing', issues.join('; '));
  } catch (e) { fail('Date/Time Parsing', e.message); }

  // ── TEST 14: Template system ──
  try {
    const templates = getEmailTemplates();
    const keys = Object.keys(templates);
    if (keys.length !== 8) { fail('Template System', 'Expected 8 templates, got ' + keys.length); }
    else {
      const missing = [];
      for (const k of keys) {
        const t = templates[k];
        if (!t.subject) missing.push(k + ': no subject');
        if (!t.initialMsg) missing.push(k + ': no initialMsg');
        if (!t.category) missing.push(k + ': no category');
        if (!t.label) missing.push(k + ': no label');
      }
      if (missing.length === 0) pass('Template System', '8 templates OK. Categories: Job Application (' + keys.filter(function(k) { return templates[k].category === 'Job Application'; }).length + '), Cold Outreach (' + keys.filter(function(k) { return templates[k].category === 'Cold Outreach'; }).length + ')');
      else fail('Template System', missing.join('; '));
    }
  } catch (e) { fail('Template System', e.message); }

  // ── TEST 15: Signature fetch ──
  try {
    const sig = getDefaultGmailSignature();
    if (sig && sig.length > 10) pass('Signature Fetch', 'Signature found (' + sig.length + ' chars). Preview: "' + stripHtml(sig).substring(0, 60) + '..."');
    else warn('Signature Fetch', 'No signature found. Use Setup Signature Manually to set one.');
  } catch (e) { fail('Signature Fetch', e.message); }

  // ── TEST 16: Daily quota ──
  try {
    const sent = getDailySendCount();
    const remaining = getRemainingDailyQuota();
    if (typeof sent === 'number' && typeof remaining === 'number' && sent + remaining === DAILY_SEND_LIMIT) {
      pass('Daily Quota', 'Sent today: ' + sent + ', Remaining: ' + remaining + ', Limit: ' + DAILY_SEND_LIMIT);
    } else {
      fail('Daily Quota', 'sent=' + sent + ' remaining=' + remaining + ' limit=' + DAILY_SEND_LIMIT + ' (should add up)');
    }
  } catch (e) { fail('Daily Quota', e.message); }

  // ── TEST 17: Contacts data check ──
  try {
    const contactsSheet = ss.getSheetByName(CONTACTS_SHEET_NAME);
    if (!contactsSheet) { warn('Contacts Data', 'Contacts sheet not found.'); }
    else {
      const data = contactsSheet.getDataRange().getValues();
      let totalRows = data.length - 2;
      let withEmail = 0, validEmail = 0;
      for (let i = 2; i < data.length; i++) {
        const email = String(data[i][CONTACT_EMAIL_COL - 1] || '').trim();
        if (email) { withEmail++; if (isValidEmail(email)) validEmail++; }
      }
      pass('Contacts Data', 'Total rows: ' + totalRows + ', With email: ' + withEmail + ', Valid emails: ' + validEmail);
    }
  } catch (e) { fail('Contacts Data', e.message); }

  // ── TEST 18: Job Tracker data check ──
  try {
    const jobSheet = ss.getSheetByName(SHEET_NAME);
    if (!jobSheet) { fail('Job Tracker Data', 'Sheet not found.'); }
    else {
      const data = jobSheet.getDataRange().getValues();
      let totalRows = 0, withEmail = 0, validEmail = 0;
      const statusCounts = {};
      for (let i = DATA_START_ROW - 1; i < data.length; i++) {
        totalRows++;
        const email = String(data[i][RECRUITER_EMAIL_COL - 1] || '').trim();
        if (email) { withEmail++; if (isValidEmail(email)) validEmail++; }
        const status = String(data[i][EMAIL_STATUS_COL - 1] || '').trim() || '(empty)';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      let statusSummary = [];
      for (const s in statusCounts) statusSummary.push(s + ': ' + statusCounts[s]);
      pass('Job Tracker Data', 'Rows: ' + totalRows + ', With email: ' + withEmail + ', Valid: ' + validEmail + '. Status breakdown: ' + statusSummary.join(', '));
    }
  } catch (e) { fail('Job Tracker Data', e.message); }

  // ── TEST 19: Dry run simulation ──
  try {
    const jobSheet = ss.getSheetByName(SHEET_NAME);
    const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
    if (!jobSheet || !dataSheet) { fail('Dry Run Simulation', 'Required sheets missing.'); }
    else {
      const allData = jobSheet.getDataRange().getValues();
      const headers = allData[HEADER_ROW - 1];
      const messageData = getMessageData(dataSheet);
      let ready = 0, noEmail = 0, invalidEmail = 0, bounced = 0, alreadyDone = 0, sampleSubject = '';
      for (let i = DATA_START_ROW - 1; i < allData.length; i++) {
        const email = allData[i][RECRUITER_EMAIL_COL - 1];
        if (!email) { noEmail++; continue; }
        const status = String(allData[i][EMAIL_STATUS_COL - 1] || '');
        if (status.includes('BOUNCED')) { bounced++; continue; }
        if (status.includes('Draft Created') || status.includes('Sent')) { alreadyDone++; continue; }
        if (!isValidEmail(email)) { invalidEmail++; continue; }
        if (!sampleSubject) {
          const pData = getTemplatePersonalizationData(allData[i], headers);
          sampleSubject = personalizeMessage(messageData.subject, pData, true);
        }
        ready++;
      }
      const detail = 'Ready to draft: ' + ready + ', Already done: ' + alreadyDone + ', No email: ' + noEmail + ', Invalid: ' + invalidEmail + ', Bounced: ' + bounced;
      if (ready > 0) pass('Dry Run Simulation', detail + '. Sample subject: "' + sampleSubject.substring(0, 60) + '"');
      else if (alreadyDone > 0) pass('Dry Run Simulation', detail + '. All emails already processed.');
      else warn('Dry Run Simulation', detail + '. No emails ready to send.');
    }
  } catch (e) { fail('Dry Run Simulation', e.message); }

  // ── TEST 20: Schedule properties ──
  try {
    const props = PropertiesService.getScriptProperties().getProperties();
    const schedKeys = Object.keys(props).filter(function(k) { return k.startsWith('schedule_') && !k.endsWith('_trigger'); });
    const now = Date.now();
    let stale = 0, upcoming = 0, parseErrors = 0;
    for (const k of schedKeys) {
      try {
        const d = JSON.parse(props[k]);
        const t = d.scheduledAt ? parseInt(d.scheduledAt, 10) : 0;
        if (t > 0 && t < now - 24 * 60 * 60 * 1000) stale++;
        else upcoming++;
      } catch (_) { parseErrors++; }
    }
    if (schedKeys.length === 0) pass('Schedule Properties', 'No scheduled emails in queue.');
    else {
      let detail = 'Total: ' + schedKeys.length + ', Upcoming: ' + upcoming + ', Stale (>24h old): ' + stale;
      if (parseErrors > 0) detail += ', Parse errors: ' + parseErrors;
      if (stale > 0 || parseErrors > 0) warn('Schedule Properties', detail + '. Consider running Cleanup All Triggers.');
      else pass('Schedule Properties', detail);
    }
  } catch (e) { fail('Schedule Properties', e.message); }

  // ── TEST 21: Trigger health ──
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const batchTriggers = triggers.filter(function(t) { return t.getHandlerFunction() === BATCH_TRIGGER_FUNCTION; });
    const safetyTriggers = triggers.filter(function(t) { return t.getHandlerFunction() === SAFETY_TRIGGER_FUNCTION; });
    const schedProps = Object.keys(PropertiesService.getScriptProperties().getProperties()).filter(function(k) { return k.startsWith('schedule_') && !k.endsWith('_trigger'); });
    let detail = 'Batch triggers: ' + batchTriggers.length + ', Safety triggers: ' + safetyTriggers.length + ', Pending schedules: ' + schedProps.length;
    if (schedProps.length > 0 && batchTriggers.length === 0) warn('Trigger Health', detail + '. Pending emails exist but no batch trigger! Run Force Run Batch Now.');
    else if (schedProps.length === 0 && (batchTriggers.length > 0 || safetyTriggers.length > 0)) warn('Trigger Health', detail + '. Orphan triggers found. Run Cleanup All Triggers.');
    else pass('Trigger Health', detail);
  } catch (e) { fail('Trigger Health', e.message); }

  // ── TEST 22: Tracking config ──
  try {
    const webAppUrl = PropertiesService.getScriptProperties().getProperty(WEBAPP_URL_KEY);
    if (webAppUrl && webAppUrl.startsWith('https://')) pass('Tracking Config', 'Web app URL configured: ' + webAppUrl.substring(0, 50) + '...');
    else warn('Tracking Config', 'Not configured. Open/click tracking disabled. Use Setup Tracking to enable.');
  } catch (e) { fail('Tracking Config', e.message); }

  // ── BUILD HTML REPORT ──
  const timestamp = new Date().toLocaleString();
  let html = '<html><head><style>' +
    'body{font-family:Arial,sans-serif;padding:15px;margin:0;background:#fafafa;}' +
    'h2{margin:0 0 5px;color:#1a73e8;}' +
    '.summary{display:flex;gap:15px;margin:10px 0;font-size:15px;font-weight:bold;}' +
    '.s-pass{color:#34a853;} .s-fail{color:#ea4335;} .s-warn{color:#f9ab00;}' +
    'table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;}' +
    'th{background:#4285f4;color:#fff;padding:8px;text-align:left;}' +
    'td{padding:6px 8px;border-bottom:1px solid #e0e0e0;vertical-align:top;}' +
    '.pass{background:#e6f4ea;} .fail{background:#fce8e6;} .warn{background:#fef7e0;}' +
    '.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;color:#fff;}' +
    '.badge-pass{background:#34a853;} .badge-fail{background:#ea4335;} .badge-warn{background:#f9ab00;}' +
    '.detail{color:#555;max-width:550px;word-wrap:break-word;}' +
    '.ts{font-size:11px;color:#999;margin-top:5px;}' +
    '</style></head><body>' +
    '<h2>Full Diagnostic Report</h2>' +
    '<div class="summary">' +
    '<span class="s-pass">PASS: ' + passCount + '</span>' +
    '<span class="s-fail">FAIL: ' + failCount + '</span>' +
    '<span class="s-warn">WARN: ' + warnCount + '</span>' +
    '</div>' +
    '<div class="ts">Run at: ' + timestamp + '</div>' +
    '<table><tr><th>#</th><th>Status</th><th>Test</th><th>Details</th></tr>';

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const cls = r.status === 'PASS' ? 'pass' : (r.status === 'FAIL' ? 'fail' : 'warn');
    const badge = r.status === 'PASS' ? 'badge-pass' : (r.status === 'FAIL' ? 'badge-fail' : 'badge-warn');
    html += '<tr class="' + cls + '">' +
      '<td>' + (i + 1) + '</td>' +
      '<td><span class="badge ' + badge + '">' + r.status + '</span></td>' +
      '<td>' + r.name + '</td>' +
      '<td class="detail">' + r.detail + '</td></tr>';
  }

  html += '</table>';

  if (failCount > 0) {
    html += '<div style="margin-top:15px;padding:10px;background:#fce8e6;border-radius:6px;font-size:13px;">' +
      '<b>Action needed:</b> Fix the FAIL items above before using email features. Common fixes:<br>' +
      '- Run <b>Setup Sheet Headers</b> to create missing sheets/headers<br>' +
      '- Check Gmail permissions by re-running the script and clicking Allow<br>' +
      '- Load a template from <b>Email Templates</b> menu</div>';
  } else if (warnCount > 0) {
    html += '<div style="margin-top:15px;padding:10px;background:#fef7e0;border-radius:6px;font-size:13px;">' +
      '<b>Looking good!</b> All critical tests passed. WARN items are optional but recommended to fix.</div>';
  } else {
    html += '<div style="margin-top:15px;padding:10px;background:#e6f4ea;border-radius:6px;font-size:13px;">' +
      '<b>All systems go!</b> Everything is configured correctly. You are ready to create drafts and schedule emails.</div>';
  }

  html += '</body></html>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(850).setHeight(700),
    'Full Diagnostic Report'
  );
}


// ═══════════════════ EMAIL TEMPLATES ═════════��═════════

function getEmailTemplates() {
  return {
    "seo_job_application": {
      category: "Job Application", label: "SEO Specialist / SEO Manager",
      subject: "Application for {{role_name}} at {{company}}",
      initialMsg:
        '<p>Dear Hiring Manager,</p>' +
        '<p>I am writing to express my strong interest in the <b>{{role_name}}</b> position at <b>{{company}}</b>.</p>' +
        '<p>With hands-on experience in Technical SEO, On-Page SEO, and content strategy, I have a proven track record of delivering measurable results:</p>' +
        '<ul><li>[Your key SEO achievement #1]</li>' +
        '<li>[Your key SEO achievement #2]</li>' +
        '<li>[Your key SEO achievement #3]</li>' +
        '<li>[Your tools and proficiencies]</li></ul>' +
        '<p>I would love the opportunity to bring this track record to your team. My portfolio is available at {{portfolio_link}}.</p>' +
        '<p>Thank you for your time and consideration.</p>',
      follow1Msg:
        '<p>Hi,</p><p>Hope you\'re doing well. I\'m following up on my application for the <b>{{role_name}}</b> position at <b>{{company}}</b>.</p>' +
        '<p>I\'d love to discuss how my results can translate to your team. Happy to chat at your convenience.</p><p>Thanks in advance!</p>',
      lastFollowMsg:
        '<p>Hi,</p><p>Just following up one final time regarding the <b>{{role_name}}</b> role at <b>{{company}}</b>.</p>' +
        '<p>I remain very interested in this opportunity.</p>' +
        '<p>If the timing isn\'t right, no worries at all. Looking forward to hearing from you.</p>'
    },
    "performance_marketing_job_application": {
      category: "Job Application", label: "Performance Marketing / PPC",
      subject: "Application for {{role_name}} at {{company}}",
      initialMsg:
        '<p>Dear Hiring Manager,</p><p>I am applying for the <b>{{role_name}}</b> at <b>{{company}}</b>, and I believe my experience managing paid media campaigns makes me a strong candidate.</p>' +
        '<p>Key results:</p>' +
        '<ul><li>[Your paid media achievement #1]</li>' +
        '<li>[Your paid media achievement #2]</li>' +
        '<li>[Your tools expertise]</li>' +
        '<li>[Your analytics proficiency]</li></ul>' +
        '<p>I\'m excited about <b>{{company}}</b> and see a direct opportunity to accelerate your performance marketing results.</p>' +
        '<p>Portfolio: {{portfolio_link}}</p><p>Thank you for considering my application.</p>',
      follow1Msg:
        '<p>Hi,</p><p>Following up on my application for the <b>{{role_name}}</b> at <b>{{company}}</b>.</p>' +
        '<p>Would love to walk you through my case studies. Happy to connect at your convenience.</p><p>Thanks!</p>',
      lastFollowMsg:
        '<p>Hi,</p><p>Final follow-up regarding the <b>{{role_name}}</b> role. I\'m still very interested and believe I would add unique value to <b>{{company}}</b>.</p>' +
        '<p>If the timing isn\'t right, I completely understand. Best of luck with the search!</p>'
    },
    "fullstack_growth_job_application": {
      category: "Job Application", label: "Growth / Full-Stack Digital Marketing",
      subject: "Application for {{role_name}} at {{company}}",
      initialMsg:
        '<p>Dear Hiring Manager,</p><p>I am applying for the <b>{{role_name}}</b> position at <b>{{company}}</b>. I\'m a full-stack digital marketer with experience across SEO, Performance Marketing, analytics, and AI-driven content workflows.</p>' +
        '<p>Here\'s what I bring:</p>' +
        '<ul><li><b>SEO:</b> [Your SEO achievements]</li>' +
        '<li><b>Paid Media:</b> [Your paid media achievements]</li>' +
        '<li><b>Analytics:</b> [Your analytics achievements]</li>' +
        '<li><b>AI Workflows:</b> [Your AI workflow achievements]</li></ul>' +
        '<p>I\'m drawn to <b>{{company}}</b> and I believe my combination of skills can drive measurable growth.</p>' +
        '<p>Portfolio: {{portfolio_link}}</p><p>Thank you for reading.</p>',
      follow1Msg:
        '<p>Hi,</p><p>Following up on my application for the <b>{{role_name}}</b> at <b>{{company}}</b>.</p>' +
        '<p>Happy to discuss how my full-stack approach can help your growth goals.</p><p>Thanks!</p>',
      lastFollowMsg:
        '<p>Hi,</p><p>One last follow-up on the <b>{{role_name}}</b> role. Still very interested.</p>' +
        '<p>If the timing isn\'t right, no worries. Wishing you the best!</p>'
    },
    "general_digital_marketing_job_application": {
      category: "Job Application", label: "General Digital Marketing",
      subject: "Application for {{role_name}} at {{company}}",
      initialMsg:
        '<p>Dear Hiring Manager,</p><p>I\'m applying for the <b>{{role_name}}</b> at <b>{{company}}</b>.</p>' +
        '<p>About me:</p>' +
        '<ul><li>[Your experience summary]</li>' +
        '<li>[Key achievement #1]</li>' +
        '<li>[Key achievement #2]</li>' +
        '<li>[Your tools proficiency]</li></ul>' +
        '<p>I\'m looking for a role where I can own strategy and drive measurable results. <b>{{company}}</b> seems like a great fit.</p>' +
        '<p>Portfolio: {{portfolio_link}}</p><p>Thanks for considering.</p>',
      follow1Msg:
        '<p>Hi,</p><p>Just following up on my application for the <b>{{role_name}}</b> at <b>{{company}}</b>.</p>' +
        '<p>Would love to chat if there\'s interest.</p><p>Thanks!</p>',
      lastFollowMsg:
        '<p>Hi,</p><p>Final follow-up regarding the <b>{{role_name}}</b>. I remain interested and available to discuss.</p>' +
        '<p>If the timing isn\'t right, I completely understand. Best regards!</p>'
    },
    "seo_cold_outreach": {
      category: "Cold Outreach", label: "SEO — Direct to Hiring Manager",
      subject: "Quick question about SEO at {{company}}",
      initialMsg:
        '<p>Hi {{name}},</p><p>I came across <b>{{company}}</b> while researching companies doing interesting SEO work.</p>' +
        '<p>I\'m an SEO specialist with a track record of delivering measurable organic growth results.</p>' +
        '<p>I\'m curious — is your team currently focused on scaling organic traffic or improving SEO? If so, I\'d love to chat for 15 minutes about how I might help.</p>' +
        '<p>No worries if the timing isn\'t right.</p>',
      follow1Msg:
        '<p>Hi {{name}},</p><p>Just a quick follow-up on my note about SEO at <b>{{company}}</b>.</p>' +
        '<p>Happy to share my approach if it\'s relevant to your team.</p>' +
        '<p>Either way, appreciate your time.</p>',
      lastFollowMsg:
        '<p>Hi {{name}},</p><p>Last note from me — I know inboxes get busy.</p>' +
        '<p>If SEO is ever on your radar at <b>{{company}}</b>, feel free to reach out. I\'d be happy to connect.</p><p>All the best!</p>'
    },
    "performance_marketing_cold_outreach": {
      category: "Cold Outreach", label: "Performance Marketing — Direct to Hiring Manager",
      subject: "Paid media question for {{company}}",
      initialMsg:
        '<p>Hi {{name}},</p><p>I saw <b>{{company}}</b> is scaling — congrats on the growth.</p>' +
        '<p>I manage paid campaigns (Google + Meta) with strong ROAS and lead generation results.</p>' +
        '<p>Is your team currently running paid campaigns or planning to scale ad spend? If there\'s a fit, I\'d love a quick 15-minute call to explore.</p>' +
        '<p>If not the right time, totally understand.</p>',
      follow1Msg:
        '<p>Hi {{name}},</p><p>Following up on my note about paid media at <b>{{company}}</b>.</p>' +
        '<p>Happy to share some quick wins I\'ve delivered if it\'s relevant.</p><p>No pressure either way!</p>',
      lastFollowMsg:
        '<p>Hi {{name}},</p><p>Last follow-up — if you\'re ever looking for paid media help at <b>{{company}}</b>, I\'d be glad to chat.</p>' +
        '<p>Wishing you and the team continued growth!</p>'
    },
    "growth_cold_outreach": {
      category: "Cold Outreach", label: "Growth Marketing — Direct to Hiring Manager",
      subject: "Growth marketing — quick question",
      initialMsg:
        '<p>Hi {{name}},</p><p>I\'ve been following <b>{{company}}</b>\'s growth — impressive trajectory.</p>' +
        '<p>I\'m a growth marketer who works across SEO and Paid with proven results.</p>' +
        '<p>Are you currently hiring for marketing roles or open to a conversation about growth opportunities?</p><p>Either way, happy to connect.</p>',
      follow1Msg:
        '<p>Hi {{name}},</p><p>Just bumping this up — are you open to a quick chat about growth marketing at <b>{{company}}</b>?</p>' +
        '<p>I cover SEO + Paid + AI workflows — happy to share ideas, no strings attached.</p><p>Thanks!</p>',
      lastFollowMsg:
        '<p>Hi {{name}},</p><p>Final note — I know you\'re busy. If <b>{{company}}</b> ever needs growth marketing support, feel free to reach out anytime.</p><p>All the best!</p>'
    },
    "general_cold_outreach": {
      category: "Cold Outreach", label: "General Digital Marketing — Direct Outreach",
      subject: "Digital marketing — open to a quick chat?",
      initialMsg:
        '<p>Hi {{name}},</p><p>I\'m a digital marketer with experience in SEO and Paid Media.</p>' +
        '<p>I\'m exploring new opportunities and <b>{{company}}</b> caught my eye. Are you open to a brief conversation?</p>' +
        '<p>If the timing isn\'t right, no worries at all.</p>',
      follow1Msg:
        '<p>Hi {{name}},</p><p>Just following up on my note. I\'d love to learn more about <b>{{company}}</b>\'s marketing goals and see if I can contribute.</p>' +
        '<p>Happy to do a quick 10-minute call or exchange a few emails — whatever works best.</p><p>Thanks!</p>',
      lastFollowMsg:
        '<p>Hi {{name}},</p><p>Last follow-up from me. If you\'re ever looking for digital marketing support, I\'d be glad to connect.</p>' +
        '<p>Wishing you and <b>{{company}}</b> continued success!</p>'
    }
  };
}


// ═══════════════════ TEMPLATE SELECTOR UI ═══════════════════

function showTemplateSelector() {
  const templates = getEmailTemplates();
  let jobAppOptions = '', coldOutreachOptions = '';
  for (const key of Object.keys(templates)) {
    const t = templates[key];
    const opt = '<option value="' + key + '">' + t.label + '</option>';
    if (t.category === 'Job Application') jobAppOptions += opt;
    else coldOutreachOptions += opt;
  }

  const htmlContent =
    '<!DOCTYPE html><html><head><base target="_top"><style>' +
    'body{font-family:Arial,sans-serif;padding:20px;}h2{color:#1a73e8;margin-top:0;}' +
    '.section{margin:15px 0;padding:15px;border:1px solid #ddd;border-radius:8px;background:#f8f9fa;}.section h3{margin-top:0;color:#333;}' +
    'select{width:100%;padding:8px;font-size:14px;border-radius:4px;border:1px solid #ccc;}' +
    'label{font-weight:bold;display:block;margin-bottom:5px;color:#555;}' +
    'input[type="text"]{width:100%;padding:8px;font-size:14px;border-radius:4px;border:1px solid #ccc;box-sizing:border-box;margin-bottom:10px;}' +
    '.btn{padding:10px 24px;font-size:14px;border:none;border-radius:6px;cursor:pointer;margin:5px;}' +
    '.btn-primary{background:#1a73e8;color:white;}.btn-secondary{background:#f1f3f4;color:#333;}.btn-preview{background:#34a853;color:white;}' +
    '.tag-info{font-size:12px;color:#666;margin-top:10px;padding:8px;background:#fff3cd;border-radius:4px;}.footer{margin-top:20px;text-align:right;}' +
    '#previewArea{display:none;margin-top:15px;padding:15px;border:2px solid #34a853;border-radius:8px;background:#f1f8f4;max-height:250px;overflow-y:auto;font-size:13px;}' +
    '</style></head><body>' +
    '<h2>📧 Email Template Selector</h2>' +
    '<div class="section"><h3>📋 Job Application</h3><label>Select:</label><select id="jobTemplates"><option value="">-- Select --</option>' + jobAppOptions + '</select></div>' +
    '<div class="section"><h3>🎯 Cold Outreach</h3><label>Select:</label><select id="coldTemplates"><option value="">-- Select --</option>' + coldOutreachOptions + '</select></div>' +
    '<div class="section"><h3>⚙️ Settings</h3><label>Portfolio Link:</label><input type="text" id="portfolioLink" placeholder="https://your-portfolio.com" />' +
    '<label>Default Role Name (optional):</label><input type="text" id="roleName" placeholder="e.g., SEO Manager" /></div>' +
    '<div class="tag-info"><b>Tags:</b> {{name}}, {{company}}, {{email}}, {{role_name}}, {{location}}, {{platform}}, {{portfolio_link}}</div>' +
    '<div id="previewArea"></div>' +
    '<div class="footer"><button class="btn btn-secondary" onclick="google.script.host.close()">Cancel</button> ' +
    '<button class="btn btn-preview" onclick="previewTemplate()">👁️ Preview</button> ' +
    '<button class="btn btn-primary" onclick="loadTemplate()">✅ Load into Data Sheet</button></div>' +
    '<script>' +
    'document.getElementById("jobTemplates").addEventListener("change",function(){if(this.value)document.getElementById("coldTemplates").value="";});' +
    'document.getElementById("coldTemplates").addEventListener("change",function(){if(this.value)document.getElementById("jobTemplates").value="";});' +
    'function getSelectedKey(){return document.getElementById("jobTemplates").value||document.getElementById("coldTemplates").value;}' +
    'function previewTemplate(){var key=getSelectedKey();if(!key){alert("Select a template first.");return;}' +
    'google.script.run.withSuccessHandler(function(html){var a=document.getElementById("previewArea");a.innerHTML=html;a.style.display="block";}).previewTemplateById(key);}' +
    'function loadTemplate(){var key=getSelectedKey();if(!key){alert("Select a template first.");return;}' +
    'var p=document.getElementById("portfolioLink").value.trim();var r=document.getElementById("roleName").value.trim();' +
    'google.script.run.withSuccessHandler(function(msg){alert(msg);google.script.host.close();}).withFailureHandler(function(e){alert("Error: "+e.message);}).loadTemplateToDataSheet(key,p,r);}' +
    '</script></body></html>';

  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(htmlContent).setWidth(UI_TEMPLATE_SELECTOR.w).setHeight(UI_TEMPLATE_SELECTOR.h), '📧 Select Email Template');
}

function previewTemplateById(templateKey) {
  const t = getEmailTemplates()[templateKey];
  if (!t) return '<p style="color:red;">Template not found.</p>';
  const sample = { name:'John', company:'Acme Corp', email:'john@acme.com', role_name:'Marketing Manager', location:'Bangalore', platform:'LinkedIn', portfolio_link:'https://portfolio.example.com' };
  return '<h4 style="margin:0 0 5px;">[' + t.category + '] ' + t.label + '</h4><p style="margin:2px 0;"><b>Subject:</b> ' +
    personalizeMessage(t.subject, sample, true) + '</p><hr style="margin:8px 0;"><div style="font-size:13px;">' + personalizeMessage(t.initialMsg, sample) + '</div>';
}

function loadTemplateToDataSheet(templateKey, portfolioLink, defaultRoleName) {
  const t = getEmailTemplates()[templateKey];
  if (!t) throw new Error('Template not found: ' + templateKey);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!dataSheet) { setupSheetHeaders(); dataSheet = ss.getSheetByName(DATA_SHEET_NAME); }

  if (portfolioLink) PropertiesService.getScriptProperties().setProperty('USER_PORTFOLIO_LINK', portfolioLink);
  if (defaultRoleName) PropertiesService.getScriptProperties().setProperty('DEFAULT_ROLE_NAME', defaultRoleName);

  dataSheet.getRange(DATA_SUBJECT_ROW, DATA_VALUE_COL).setValue(t.subject);
  dataSheet.getRange(DATA_INITIAL_MSG_ROW, DATA_VALUE_COL).setValue(t.initialMsg);
  dataSheet.getRange(DATA_FOLLOW1_MSG_ROW, DATA_VALUE_COL).setValue(t.follow1Msg);
  dataSheet.getRange(DATA_LAST_FOLLOW_MSG_ROW, DATA_VALUE_COL).setValue(t.lastFollowMsg);

  const infoRow = DATA_LAST_FOLLOW_MSG_ROW + 2;
  dataSheet.getRange(infoRow, 1).setValue("ACTIVE TEMPLATE");
  dataSheet.getRange(infoRow, 2).setValue('[' + t.category + '] ' + t.label + ' — loaded ' + new Date().toLocaleString());
  dataSheet.getRange(infoRow, 1, 1, 2).setFontWeight("bold").setBackground("#d4edda");

  return 'Template loaded: [' + t.category + '] ' + t.label + '\n\nPortfolio: ' + (portfolioLink || 'Not set') + '\nDefault Role: ' + (defaultRoleName || 'Not set');
}


// ══════���════════════ QUICK TEMPLATE ACTIONS ═════════���═════════

function loadTemplateSEOJob() {
  loadTemplateToDataSheet('seo_job_application', '', '');
  SpreadsheetApp.getUi().alert('✅ SEO Job Application template loaded.');
}

function loadTemplatePerfMarketingJob() {
  loadTemplateToDataSheet('performance_marketing_job_application', '', '');
  SpreadsheetApp.getUi().alert('✅ Performance Marketing template loaded.');
}

function loadTemplateGrowthJob() {
  loadTemplateToDataSheet('fullstack_growth_job_application', '', '');
  SpreadsheetApp.getUi().alert('✅ Growth Marketing template loaded.');
}

function loadTemplateSEOOutreach() {
  loadTemplateToDataSheet('seo_cold_outreach', '', '');
  SpreadsheetApp.getUi().alert('✅ SEO Cold Outreach template loaded.');
}

function loadTemplateGrowthOutreach() {
  loadTemplateToDataSheet('growth_cold_outreach', '', '');
  SpreadsheetApp.getUi().alert('✅ Growth Cold Outreach template loaded.');
}


// ═══════════���═══════ SMALL HELPERS ═══════════════════

function extractTimestampFromKey(key) {
  try {
    const m = key.match(/^schedule_(\d{12,})/);
    if (m) return parseInt(m[1], 10);
    const nums = key.match(/(\d{12,})/g);
    if (nums && nums.length) return parseInt(nums[0], 10);
  } catch (_) {}
  return null;
}
