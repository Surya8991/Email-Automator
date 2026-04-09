// ═══════════════════ EMAIL AUTOMATION ENGINE v2 — Frontend ═══════════════════
let currentPage = 'dashboard';
let authStatus = null;
let darkMode = localStorage.getItem('darkMode') === 'true';
let contactPage = 1;
let contactSearch = '';
let eventSource = null;
let openNavGroups = JSON.parse(localStorage.getItem('openNavGroups') || '["Email"]');

// Track last focused input for tag insertion
let lastFocusedInput = null;
document.addEventListener('focusin', e => { if (e.target.matches('#c-subj,#c-init,#c-f1,#c-last')) lastFocusedInput = e.target; });

function insertTag(fallbackId, tag) {
  const el = lastFocusedInput || document.getElementById(fallbackId);
  if (!el) return;
  el.focus();
  const start = el.selectionStart || el.value.length;
  const end = el.selectionEnd || el.value.length;
  el.value = el.value.substring(0, start) + tag + el.value.substring(end);
  const newPos = start + tag.length;
  el.setSelectionRange(newPos, newPos);
  el.focus();
}

function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function api(url, opts) {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json();
    if (data.needLogin) { currentPage = 'login'; render(); return data; }
    return data;
  } catch (e) { return { error: e.message }; }
}

// ── Toast ──
function toast(msg, type = 'info') {
  const container = document.getElementById('toasts');
  // Limit to 3 visible
  while (container.children.length >= 3) container.removeChild(container.firstChild);
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 4000);
}

// ── Modal ──
function showModal(html) { document.getElementById('modal-content').innerHTML = '<button class="modal-close" onclick="closeModal()">&#10005;</button>' + html; document.getElementById('modal-overlay').classList.add('active'); }
function closeModal() { document.getElementById('modal-overlay').classList.remove('active'); }
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

// ── Dark Mode ──
function toggleDarkMode() { darkMode = !darkMode; localStorage.setItem('darkMode', darkMode); document.body.classList.toggle('dark', darkMode); render(); }

function toggleNav(el) {
  const name = el.querySelector('.label').textContent;
  el.classList.toggle('open');
  const content = el.nextElementSibling;
  if (content) content.classList.toggle('open');
  if (openNavGroups.includes(name)) openNavGroups = openNavGroups.filter(n => n !== name);
  else openNavGroups.push(name);
  localStorage.setItem('openNavGroups', JSON.stringify(openNavGroups));
}

function restoreNavGroups() {
  document.querySelectorAll('.nav-group-toggle').forEach(el => {
    const name = el.querySelector('.label') ? el.querySelector('.label').textContent : '';
    if (openNavGroups.includes(name)) { el.classList.add('open'); if (el.nextElementSibling) el.nextElementSibling.classList.add('open'); }
  });
}

// ── SSE Progress ──
function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/progress');
  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const prog = document.getElementById('progress-bar');
    if (!prog) return;
    if (data.type === 'draft_progress') {
      const pct = Math.round((data.processed / data.total) * 100);
      prog.innerHTML = `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><p class="progress-text">${data.processed}/${data.total} — ${data.email}</p>`;
    } else if (data.type === 'draft_done') {
      prog.innerHTML = `<div style="text-align:center;padding:8px"><span class="success-check">&#10003;</span><p class="progress-text" style="color:var(--success);margin-top:6px">Done! ${data.processed} created, ${data.errors} errors, ${data.skipped} skipped</p></div>`;
    } else if (data.type === 'draft_stopped') {
      prog.innerHTML = `<p class="progress-text" style="color:var(--warning)">Stopped by user.</p>`;
    }
  };
}

// ── Router ──
function navigate(page) { currentPage = page; document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page)); renderPage(); }

// ── Init ──
async function init() {
  // Apply dark mode immediately before anything renders
  if (darkMode) document.body.classList.add('dark');
  authStatus = await api('/auth/status');
  render();
  connectSSE();
  setInterval(() => { if (currentPage === 'dashboard') renderPage(); }, 30000);
  // Keyboard shortcuts
  // Close action menus on click outside
  document.addEventListener('click', e => { if (!e.target.closest('.action-menu')) document.querySelectorAll('.action-menu-drop.show').forEach(d => d.classList.remove('show')); });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (!authStatus || !authStatus.loggedIn) return;
    const key = e.key.toLowerCase();
    if (key === 'd' && !e.ctrlKey) navigate('drafts');
    else if (key === 'c' && !e.ctrlKey) navigate('contacts');
    else if (key === 's' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); navigate('schedule'); }
    else if (key === 't') navigate('templates');
    else if (key === 'r') navigate('dryrun');
    else if (key === 'h') navigate('dashboard');
    else if (key === '?') navigate('guide');
    else if (key === 'escape') closeModal();
  });
}

function render() {
  const app = document.getElementById('app');

  // Show login page if not logged in
  if (!authStatus.loggedIn) {
    app.innerHTML = `<div class="login-page"><div class="login-card">
      <div style="font-size:48px;margin-bottom:10px">&#9993;</div>
      <div class="login-title">Email Automation</div>
      <div class="login-subtitle">Automate your job search emails — create drafts, schedule sends, track replies</div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Enter your email to receive a one-time login code</p>
      <div class="form-group"><input class="form-input" id="login-email" type="email" placeholder="your-email@gmail.com" style="text-align:center;font-size:16px"></div>
      <button class="btn btn-primary btn-lg" style="width:100%" onclick="sendOtp()">Send OTP</button>
      <div id="otp-section" style="display:none;margin-top:20px">
        <div class="login-divider">Enter OTP from your email</div>
        <div class="form-group"><input class="form-input" id="login-otp" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="123456" maxlength="6" style="text-align:center;font-size:24px;letter-spacing:8px" onkeydown="if(event.key==='Enter')verifyOtp()"></div>
        <button class="btn btn-success btn-lg" style="width:100%" onclick="verifyOtp()">Verify & Login</button>
        <button class="btn btn-outline btn-sm" style="width:100%;margin-top:8px" id="resend-btn" onclick="resendOtp()" disabled>Resend OTP (30s)</button>
      </div>
      ${authStatus.oauthConfigured ? '<div class="login-divider">or</div><a href="/auth/google" class="btn btn-google" style="width:100%"><span style="font-size:18px">G</span> Sign in with Google</a>' : ''}
      <div id="login-msg" style="margin-top:15px"></div>
    </div></div>`;
    return;
  }

  app.innerHTML = `
    <div class="app">
      <nav class="sidebar">
        <div class="sidebar-logo"><span>&#9993;</span> Email Engine</div>
        <div class="nav-item active" data-page="dashboard" onclick="navigate('dashboard')"><span class="icon">&#9733;</span><span class="label">Dashboard</span></div>
        <div class="nav-item" data-page="contacts" onclick="navigate('contacts')"><span class="icon">&#128101;</span><span class="label">Contacts</span></div>
        <div class="nav-item" data-page="templates" onclick="navigate('templates')"><span class="icon">&#128196;</span><span class="label">Templates</span></div>

        <div class="nav-group-toggle" onclick="toggleNav(this)"><span class="icon" style="font-size:15px">&#9993;</span><span class="label">Email</span><span class="arrow label">&#9654;</span></div>
        <div class="nav-group-content">
          <div class="nav-item" data-page="drafts" onclick="navigate('drafts')"><span class="label">Create Drafts</span></div>
          <div class="nav-item" data-page="mydrafts" onclick="navigate('mydrafts')"><span class="label">My Drafts</span></div>
          <div class="nav-item" data-page="schedule" onclick="navigate('schedule')"><span class="label">Schedule</span></div>
          <div class="nav-item" data-page="dryrun" onclick="navigate('dryrun')"><span class="label">Dry Run</span></div>
        </div>

        <div class="nav-group-toggle" onclick="toggleNav(this)"><span class="icon" style="font-size:15px">&#128203;</span><span class="label">Logs</span><span class="arrow label">&#9654;</span></div>
        <div class="nav-group-content">
          <div class="nav-item" data-page="batchlog" onclick="navigate('batchlog')"><span class="label">Batch Log</span></div>
          <div class="nav-item" data-page="audit" onclick="navigate('audit')"><span class="label">Audit Log</span></div>
          <div class="nav-item" data-page="blocklist" onclick="navigate('blocklist')"><span class="label">Blocklist</span></div>
        </div>

        <div class="nav-group-toggle" onclick="toggleNav(this)"><span class="icon" style="font-size:15px">&#9881;</span><span class="label">Settings</span><span class="arrow label">&#9654;</span></div>
        <div class="nav-group-content">
          <div class="nav-item" data-page="profile" onclick="navigate('profile')"><span class="label">My Profile</span></div>
          <div class="nav-item" data-page="settings" onclick="navigate('settings')"><span class="label">Settings</span></div>
          <div class="nav-item" data-page="diagnostic" onclick="navigate('diagnostic')"><span class="label">Diagnostic</span></div>
          <div class="nav-item" data-page="guide" onclick="navigate('guide')"><span class="label">User Guide</span></div>
          <div class="nav-item" data-page="admin" onclick="navigate('admin')"><span class="label">Admin Panel</span></div>
        </div>

        <div style="padding:8px 8px;margin-top:auto">
          <div class="nav-item" onclick="toggleDarkMode()" style="justify-content:center"><span class="icon">&#127769;</span><span class="label">${darkMode ? 'Light' : 'Dark'}</span></div>
        </div>
        ${authStatus.googleTokens ? '' : (authStatus.oauthConfigured ? '<div class="nav-item" onclick="window.location=\'/auth/google\'"><span class="icon">&#128274;</span><span class="label">Link Google</span></div>' : '')}
        <div class="nav-item" onclick="window.location='/auth/logout'" style="margin-bottom:8px"><span class="icon">&#8618;</span><span class="label">Logout (${authStatus.user.email.split('@')[0]})</span></div>
      </nav>
      <main class="main" id="page-content"></main>
    </div>`;
  restoreNavGroups();
  renderPage();
}

async function sendOtp() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { document.getElementById('login-msg').innerHTML = '<span style="color:var(--danger)">Enter your email</span>'; return; }
  document.getElementById('login-msg').innerHTML = '<span style="color:var(--primary)">Sending OTP...</span>';
  const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email }) });
  if (r.error) { document.getElementById('login-msg').innerHTML = '<span style="color:var(--danger)">' + r.error + '</span>'; }
  else { document.getElementById('otp-section').style.display = 'block'; document.getElementById('login-msg').innerHTML = '<span style="color:var(--success)">OTP sent! Check your inbox.</span>'; document.getElementById('login-otp').focus(); startResendCooldown(); }
}

function startResendCooldown() {
  const btn = document.getElementById('resend-btn');
  if (!btn) return;
  let sec = 30;
  btn.disabled = true;
  btn.textContent = 'Resend OTP (' + sec + 's)';
  const iv = setInterval(() => { sec--; if (sec <= 0) { clearInterval(iv); btn.disabled = false; btn.textContent = 'Resend OTP'; } else btn.textContent = 'Resend OTP (' + sec + 's)'; }, 1000);
}

async function resendOtp() { await sendOtp(); }

async function verifyOtp() {
  const email = document.getElementById('login-email').value.trim();
  const otp = document.getElementById('login-otp').value.trim();
  if (!otp) { document.getElementById('login-msg').innerHTML = '<span style="color:var(--danger)">Enter the OTP</span>'; return; }
  document.getElementById('login-msg').innerHTML = '<span style="color:var(--primary)">Verifying...</span>';
  const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
  if (r.error) { document.getElementById('login-msg').innerHTML = '<span style="color:var(--danger)">' + r.error + '</span>'; }
  else { authStatus = await api('/auth/status'); currentPage = 'dashboard'; render(); toast('Welcome!', 'success'); }
}

async function renderPage() {
  const el = document.getElementById('page-content');
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
  switch (currentPage) {
    case 'dashboard': await pgDashboard(el); break;
    case 'contacts': await pgContacts(el); break;
    case 'templates': await pgTemplates(el); break;
    case 'drafts': await pgDrafts(el); break;
    case 'mydrafts': await pgMyDrafts(el); break;
    case 'schedule': await pgSchedule(el); break;
    case 'dryrun': await pgDryRun(el); break;
    case 'batchlog': await pgBatchLog(el); break;
    case 'settings': await pgSettings(el); break;
    case 'profile': await pgProfile(el); break;
    case 'admin': await pgAdmin(el); break;
    case 'audit': await pgAudit(el); break;
    case 'blocklist': await pgBlocklist(el); break;
    case 'diagnostic': await pgDiagnostic(el); break;
    case 'guide': pgGuide(el); break;
  }
}

// ═══════════════════ DASHBOARD ═══════════════════
async function pgDashboard(el) {
  const stats = await api('/api/stats');
  const user = authStatus.loggedIn ? `<div class="user-badge"><img class="user-avatar" src="${authStatus.user.picture||''}" alt=""><span class="user-name">${authStatus.user.name||authStatus.user.email}</span></div>` : (authStatus.smtpConfigured ? '<span class="badge badge-info">SMTP Mode</span>' : '<span class="badge badge-warning">Not configured</span>');
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Dashboard</div><div class="page-subtitle">Email Automation Overview</div></div>${user}</div>
    ${stats.total === 0 ? '<div class="card" style="border-left:4px solid var(--primary);padding:20px"><div style="font-size:16px;font-weight:700;margin-bottom:8px">&#128075; Welcome! Let\'s get started</div><p style="color:var(--text-secondary);margin-bottom:14px">Follow these 3 steps to send your first email:</p><div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:10px"><span class="badge badge-info" style="min-width:24px;justify-content:center">1</span><span>Import your contacts</span><button class="btn btn-sm btn-primary" onclick="navigate(\'contacts\')" style="margin-left:auto">Import</button></div><div style="display:flex;align-items:center;gap:10px"><span class="badge badge-neutral" style="min-width:24px;justify-content:center">2</span><span>Choose an email template</span><button class="btn btn-sm btn-outline" onclick="navigate(\'templates\')" style="margin-left:auto">Templates</button></div><div style="display:flex;align-items:center;gap:10px"><span class="badge badge-neutral" style="min-width:24px;justify-content:center">3</span><span>Create & send drafts</span><button class="btn btn-sm btn-outline" onclick="navigate(\'drafts\')" style="margin-left:auto">Drafts</button></div></div></div>' : ''}
    ${stats.total > 0 && !stats.hasTemplate ? '<div class="card alert-warning" style="border-left:4px solid var(--warning)"><b>&#9888; No template loaded.</b> <a href="#" onclick="navigate(\'templates\');return false" style="color:var(--primary)">Load a template</a> before creating drafts.</div>' : ''}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Contacts</div><div class="stat-value">${stats.total||0}</div></div>
      <div class="stat-card"><div class="stat-label">With Email</div><div class="stat-value">${stats.withEmail||0}</div></div>
      <div class="stat-card"><div class="stat-label">Drafts Created</div><div class="stat-value success">${stats.drafted||0}</div></div>
      <div class="stat-card"><div class="stat-label">Sent Today</div><div class="stat-value warning">${stats.sentToday||0} / ${stats.dailyLimit}</div></div>
      <div class="stat-card" style="cursor:pointer" onclick="navigate('mydrafts')"><div class="stat-label">Pending Drafts</div><div class="stat-value">${stats.pendingDrafts||0}</div></div>
      <div class="stat-card"><div class="stat-label">Scheduled</div><div class="stat-value">${stats.scheduled||0}</div></div>
      <div class="stat-card"><div class="stat-label">Bounced</div><div class="stat-value danger">${stats.bounced||0}</div></div>
    </div>
    <div class="card"><div class="card-title">&#9889; Quick Actions</div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="navigate('drafts')">&#9993; Create Drafts</button>
        <button class="btn btn-outline" onclick="navigate('mydrafts')">&#128233; My Drafts</button>
        <button class="btn btn-outline" onclick="navigate('schedule')">&#9200; Schedule</button>
        <button class="btn btn-outline" onclick="navigate('contacts')">&#128229; Import</button>
      </div>
      <div class="btn-group" style="margin-top:6px">
        <button class="btn btn-sm btn-outline" onclick="navigate('dryrun')">Dry Run</button>
        <button class="btn btn-sm btn-outline" onclick="checkBounces()">Check Bounces</button>
        <button class="btn btn-sm btn-outline" onclick="checkReplies()">Check Replies</button>
      </div>
    </div>
    <div id="dashboard-charts" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>
  </div>`;
  loadCharts();
}

async function loadCharts() {
  const ch = await api('/api/charts');
  if (ch.needLogin) return;
  const el = document.getElementById('dashboard-charts');
  if (!el) return;
  // Status breakdown bar chart
  const statuses = ch.statuses || {};
  const total = Object.values(statuses).reduce((a, b) => a + b, 0) || 1;
  const colors = { Drafted: '#0078d4', Sent: '#107c10', Scheduled: '#797775', Bounced: '#a4262c', Imported: '#c8c6c4', Pending: '#e1dfdd', Cancelled: '#a19f9d', Error: '#a4262c', Replied: '#0078d4' };
  if (Object.keys(statuses).length === 0 || total <= 1) { el.innerHTML = '<div class="card"><p style="text-align:center;color:var(--text-muted);padding:16px">&#128202; Start sending emails to see analytics here</p></div>'; return; }
  const bars = Object.entries(statuses).map(([k, v]) => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:80px;font-size:12px;font-weight:600;color:var(--text-secondary)">${k}</span><div style="flex:1;background:var(--border);border-radius:4px;height:20px;overflow:hidden"><div style="height:100%;width:${(v/total*100).toFixed(1)}%;background:${colors[k]||'#6366f1'};border-radius:4px;transition:width 0.5s"></div></div><span style="font-size:12px;font-weight:700;min-width:30px">${v}</span></div>`).join('');
  // Daily sends chart
  const daily = ch.dailySends || {};
  const days = Object.keys(daily).sort().slice(-7);
  const maxSend = Math.max(...Object.values(daily), 1);
  const dayBars = days.length > 0 ? days.map(d => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1"><div style="width:100%;background:var(--border);border-radius:4px;height:100px;display:flex;align-items:flex-end;overflow:hidden"><div style="width:100%;background:linear-gradient(to top,var(--primary),var(--primary-light));border-radius:4px;height:${(daily[d]/maxSend*100).toFixed(0)}%;transition:height 0.5s"></div></div><span style="font-size:10px;color:var(--text-muted)">${d.substring(5)}</span><span style="font-size:11px;font-weight:700">${daily[d]}</span></div>`).join('') : '<p style="color:var(--text-muted);font-size:13px">No send data yet</p>';
  el.innerHTML = `<div class="card"><div class="card-title">&#128202; Status Breakdown</div>${bars}</div><div class="card"><div class="card-title">&#128200; Daily Sends (Last 7 Days)</div><div style="display:flex;gap:6px;align-items:flex-end">${dayBars}</div></div>`;
}

async function checkReplies() {
  toast('Checking for replies...', 'info');
  const r = await api('/api/replies/check', { method: 'POST' });
  if (r.error) toast(r.error, 'error');
  else toast('Checked ' + r.checked + ' contacts, ' + r.replied + ' replied!', r.replied > 0 ? 'success' : 'info');
}

async function checkBounces() {
  toast('Checking bounces...', 'info');
  const res = await api('/api/bounces/check', { method: 'POST' });
  if (res.error) toast(res.error, 'error');
  else toast('Found ' + res.bouncedFound + ' bounced, marked ' + res.rowsMarked + ' rows', res.rowsMarked > 0 ? 'warning' : 'success');
}

// ═══════════════════ CONTACTS ═══════════════════
async function pgContacts(el) {
  const data = await api(`/api/contacts?limit=50&page=${contactPage}&search=${encodeURIComponent(contactSearch)}`);
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Contacts</div><div class="page-subtitle">${data.total} total, ${data.withEmail} with email</div></div>
      <div class="btn-group">
        <button class="btn btn-success" onclick="showAddContactModal()">&#10010; Add</button>
        <button class="btn btn-primary" onclick="showImportModal()">&#128229; Import</button>
        <a href="/api/contacts/export" class="btn btn-outline">&#128190; Export</a>
        <a href="/api/csv-template" class="btn btn-outline btn-sm">&#128196; CSV Template</a>
        <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete ALL?')){api('/api/contacts',{method:'DELETE'}).then(()=>{toast('Cleared','success');navigate('contacts')})}">&#128465; Clear</button>
      </div></div>
    <div style="margin-bottom:15px"><input class="form-input" placeholder="Search by name, company, email, job title..." value="${contactSearch}" oninput="contactSearch=this.value" onkeydown="if(event.key==='Enter'){contactPage=1;navigate('contacts')}"></div>
    ${data.contacts.length === 0 ? '<div class="empty-state"><div class="icon">&#128101;</div><h3>No contacts</h3><p>Import an Excel or CSV file to get started.</p><br><button class="btn btn-primary btn-lg" onclick="showImportModal()">&#128229; Import Contacts</button></div>' :
    `<div id="bulk-bar" style="background:var(--primary-glow);border-radius:4px;display:flex;align-items:center;gap:8px"><span id="bulk-count" style="font-weight:600;font-size:13px">0 selected</span><button class="btn btn-sm btn-primary" onclick="bulkDraftSelected()">Draft</button><button class="btn btn-sm btn-outline" onclick="bulkResetSelected()">Reset</button><button class="btn btn-sm btn-danger" onclick="bulkDeleteSelected()">Delete</button><button class="btn btn-sm btn-outline" onclick="deselectAll()">Cancel</button></div>
    <div class="table-wrap"><table><thead><tr><th><input type="checkbox" onchange="toggleSelectAll(this)"></th><th>ID</th><th>Name</th><th>Company</th><th>Job Title</th><th>Email</th><th>Status</th><th>Email Status</th><th>Actions</th></tr></thead><tbody>
    ${data.contacts.map(c=>`<tr>
      <td><input type="checkbox" class="row-check" value="${c.id}" onchange="updateBulkBar()"></td><td>${c.id}</td><td>${c.recruiter_name||'-'}</td><td>${c.company||'-'}</td><td>${c.job_title||'-'}</td>
      <td style="font-size:12px">${c.recruiter_email||'-'}</td>
      <td><span class="badge badge-neutral">${c.status||'-'}</span></td>
      <td><span class="badge ${c.email_status&&c.email_status.includes('Draft')?'badge-success':c.email_status&&c.email_status.includes('Sent')?'badge-info':c.email_status&&c.email_status.includes('BOUNCED')?'badge-danger':'badge-neutral'}">${(c.email_status||'-').substring(0,30)}</span></td>
      <td><div class="action-menu"><button class="action-menu-btn" onclick="this.nextElementSibling.classList.toggle('show')" data-tip="Actions">&#8943;</button><div class="action-menu-drop"><a onclick="this.parentElement.classList.remove('show');previewContact(${c.id})">&#128065; Preview</a><a onclick="this.parentElement.classList.remove('show');showTimeline(${c.id})">&#128339; Timeline</a><a onclick="this.parentElement.classList.remove('show');editContact(${c.id})">&#9998; Edit</a><a onclick="this.parentElement.classList.remove('show');if(confirm('Delete?')){api('/api/contacts/${c.id}',{method:'DELETE'}).then(()=>{toast('Deleted','success');navigate('contacts')})}" style="color:var(--danger)">&#128465; Delete</a></div></div></td>
    </tr>`).join('')}</tbody></table></div>
    <div style="display:flex;justify-content:center;gap:10px;margin-top:15px;align-items:center">
      <button class="btn btn-sm btn-outline" ${data.page<=1?'disabled':''} onclick="contactPage--;navigate('contacts')">&#8592; Prev</button>
      <span style="color:var(--text-secondary)">Page ${data.page} of ${data.pages}</span>
      <button class="btn btn-sm btn-outline" ${data.page>=data.pages?'disabled':''} onclick="contactPage++;navigate('contacts')">Next &#8594;</button>
    </div>`}
  </div>`;
}

function showAddContactModal() {
  showModal(`<div class="modal-title">&#10010; Add New Contact</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="add-name" placeholder="John Doe"></div>
      <div class="form-group"><label class="form-label">Email *</label><input class="form-input" id="add-email" placeholder="john@company.com" type="email"></div>
      <div class="form-group"><label class="form-label">Company</label><input class="form-input" id="add-company" placeholder="Acme Corp"></div>
      <div class="form-group"><label class="form-label">Job Title / Role</label><input class="form-input" id="add-title" placeholder="HR Manager"></div>
      <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="add-location" placeholder="Bangalore"></div>
      <div class="form-group"><label class="form-label">Platform</label><input class="form-input" id="add-platform" placeholder="LinkedIn"></div>
      <div class="form-group"><label class="form-label">LinkedIn URL</label><input class="form-input" id="add-linkedin" placeholder="https://linkedin.com/in/..."></div>
      <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="add-notes" placeholder="Phone, notes, etc."></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="addContact()">&#10010; Add Contact</button>
    </div>`);
  setTimeout(() => document.getElementById('add-name').focus(), 100);
}

async function addContact() {
  const email = document.getElementById('add-email').value.trim();
  const name = document.getElementById('add-name').value.trim();
  if (!email) { toast('Email is required', 'error'); return; }
  const res = await api('/api/contacts/add', { method: 'POST', body: JSON.stringify({
    recruiter_name: name,
    recruiter_email: email,
    company: document.getElementById('add-company').value.trim(),
    job_title: document.getElementById('add-title').value.trim(),
    location: document.getElementById('add-location').value.trim(),
    platform: document.getElementById('add-platform').value.trim(),
    source_url: document.getElementById('add-linkedin').value.trim(),
    notes: document.getElementById('add-notes').value.trim()
  })});
  if (res.error) { toast(res.error, 'error'); return; }
  closeModal();
  toast('Contact added: ' + (name || email), 'success');
  navigate('contacts');
}

// ── Bulk actions ──
function getSelectedIds() { return [...document.querySelectorAll('.row-check:checked')].map(c => parseInt(c.value)); }
function updateBulkBar() {
  const ids = getSelectedIds();
  const bar = document.getElementById('bulk-bar');
  if (bar) { bar.classList.toggle('visible', ids.length > 0); document.getElementById('bulk-count').textContent = ids.length + ' selected'; }
}
function toggleSelectAll(el) { document.querySelectorAll('.row-check').forEach(c => c.checked = el.checked); updateBulkBar(); }
function deselectAll() { document.querySelectorAll('.row-check').forEach(c => c.checked = false); updateBulkBar(); }
async function bulkDeleteSelected() {
  const ids = getSelectedIds();
  if (!ids.length || !confirm('Delete ' + ids.length + ' contacts?')) return;
  const r = await api('/api/contacts/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
  if (r.error) toast(r.error, 'error'); else { toast('Deleted ' + r.deleted, 'success'); navigate('contacts'); }
}
async function bulkResetSelected() {
  const ids = getSelectedIds();
  if (!confirm('Reset email status for ' + (ids.length || 'ALL') + ' contacts?')) return;
  const r = await api('/api/contacts/bulk-reset', { method: 'POST', body: JSON.stringify({ ids }) });
  if (r.error) toast(r.error, 'error'); else { toast('Status reset!', 'success'); navigate('contacts'); }
}
async function bulkDraftSelected() {
  const ids = getSelectedIds();
  if (!ids.length) { toast('Select contacts first', 'error'); return; }
  if (!confirm('Create drafts for ' + ids.length + ' selected contacts?')) return;
  toast('Creating drafts...', 'info');
  const r = await api('/api/contacts/bulk-draft', { method: 'POST', body: JSON.stringify({ ids }) });
  if (r.error) toast(r.error, 'error'); else toast('Drafted: ' + r.processed + ', Errors: ' + r.errors, 'success');
  navigate('contacts');
}

async function showTimeline(id) {
  const r = await api('/api/contacts/' + id + '/timeline');
  if (r.error) { toast(r.error, 'error'); return; }
  showModal(`<div class="modal-title">&#128339; Timeline — ${r.contact.recruiter_name || r.contact.recruiter_email}</div>
    <p style="color:var(--text-secondary);margin-bottom:15px">${r.contact.company || ''} | ${r.contact.job_title || ''}</p>
    ${r.timeline.length === 0 ? '<p style="color:var(--text-muted)">No activity recorded yet.</p>' :
    r.timeline.map(t => `<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:12px;height:12px;border-radius:50%;background:var(--primary);margin-top:4px;flex-shrink:0"></div><div><div style="font-size:13px;font-weight:600">${t.event}</div><div style="font-size:11px;color:var(--text-muted)">${t.time || 'Current'}</div></div></div>`).join('')}
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
}

function showImportModal() {
  showModal(`<div class="modal-title">&#128229; Import Contacts</div>
    <p style="color:var(--text-secondary);margin-bottom:15px">Upload Excel (.xlsx) or CSV. Duplicates are auto-detected by email.</p>
    <input type="file" accept=".xlsx,.xls,.csv" class="form-input" id="import-file">
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="doImport()">&#128229; Import</button></div>`);
}

async function doImport() {
  const f = document.getElementById('import-file');
  if (!f.files[0]) { toast('Select a file', 'error'); return; }
  const fd = new FormData(); fd.append('file', f.files[0]);
  closeModal(); toast('Importing...', 'info');
  const res = await fetch('/api/contacts/import', { method: 'POST', body: fd }).then(r=>r.json());
  if (res.error) toast(res.error, 'error');
  else toast(`Imported ${res.imported}, Duplicates skipped: ${res.duplicates}`, 'success');
  contactPage = 1; navigate('contacts');
}

async function previewContact(id) {
  const res = await api('/api/drafts/preview/' + id);
  if (res.error) { toast(res.error, 'error'); return; }
  showModal(`<div class="modal-title">&#128065; Email Preview</div>
    <p><b>To:</b> ${res.to}</p><p><b>Name:</b> ${res.name} | <b>Company:</b> ${res.company}</p>
    <p><b>Subject:</b> ${res.subject}</p><hr>
    <div style="font-size:13px;max-height:300px;overflow-y:auto;padding:10px;background:var(--bg);border-radius:8px;color:var(--text)">${res.body}</div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
}

async function editContact(id) {
  const c = (await api('/api/contacts?limit=99999')).contacts.find(x=>x.id===id);
  if (!c) { toast('Not found', 'error'); return; }
  showModal(`<div class="modal-title">&#9998; Edit Contact #${id}</div>
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="edit-name" value="${c.recruiter_name||''}"></div>
    <div class="form-group"><label class="form-label">Company</label><input class="form-input" id="edit-company" value="${c.company||''}"></div>
    <div class="form-group"><label class="form-label">Job Title</label><input class="form-input" id="edit-title" value="${c.job_title||''}"></div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="edit-email" value="${c.recruiter_email||''}"></div>
    <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="edit-status"><option ${c.status==='Not Applied'?'selected':''}>Not Applied</option><option ${c.status==='Applied'?'selected':''}>Applied</option><option ${c.status==='In Review'?'selected':''}>In Review</option><option ${c.status==='Interview'?'selected':''}>Interview</option><option ${c.status==='Offer'?'selected':''}>Offer</option><option ${c.status==='Rejected'?'selected':''}>Rejected</option></select></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="edit-notes" rows="2">${c.notes||''}</textarea></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveContact(${id})">Save</button></div>`);
}

async function saveContact(id) {
  await api('/api/contacts/' + id, { method: 'PUT', body: JSON.stringify({ recruiter_name: document.getElementById('edit-name').value, company: document.getElementById('edit-company').value, job_title: document.getElementById('edit-title').value, recruiter_email: document.getElementById('edit-email').value, status: document.getElementById('edit-status').value, notes: document.getElementById('edit-notes').value }) });
  closeModal(); toast('Saved', 'success'); navigate('contacts');
}

// ═══════════════════ TEMPLATES ═══════════════════
async function pgTemplates(el) {
  const tpls = await api('/api/templates');
  const active = await api('/api/templates/active/current');
  const keys = Object.keys(tpls);
  const renderCard = k => `<div class="card" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:center"><div><b>${tpls[k].label}</b><br><span style="font-size:12px;color:var(--text-secondary)">${tpls[k].subject.substring(0,60)}...</span></div><div class="btn-group"><button class="btn btn-sm btn-outline" onclick="previewTemplate('${k}')">&#128065;</button><button class="btn btn-sm btn-outline" onclick="editTemplate('${k}')">&#9998;</button><button class="btn btn-sm btn-primary" onclick="loadTemplate('${k}')">Load</button></div></div></div>`;

  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Email Templates</div><div class="page-subtitle">${active.hasTemplate ? 'Active: "'+active.subject.substring(0,40)+'..."' : 'No template loaded'}</div></div></div>
    ${!active.hasTemplate ? '<div class="card alert-warning" style="border-left:4px solid var(--warning)"><b>&#9888; No template loaded.</b> Select a preset below or write a custom one.</div>' : ''}
    <div style="margin-bottom:12px"><input class="form-input" id="tpl-search" placeholder="Search templates... (e.g. referral, SEO, follow-up)" oninput="filterTemplates(this.value)"></div>
    ${['Growth Marketer','Performance Marketing','SEO Analyst','Digital Marketing Executive','Follow-Up','Thank You','EdTech','HR Tech'].map(cat => {
      const catKeys = keys.filter(k => tpls[k].category === cat);
      if (!catKeys.length) return '';
      const icons = {'Growth Marketer':'&#128200;','Performance Marketing':'&#127919;','SEO Analyst':'&#128269;','Digital Marketing Executive':'&#128196;','Follow-Up':'&#128257;','Thank You':'&#128140;','EdTech':'&#127891;','HR Tech':'&#128188;'};
      const cid = 'tc-'+cat.replace(/\s/g,'-');
      return '<div class="card" style="padding:12px"><div class="card-title tpl-category-toggle collapsed" onclick="this.classList.toggle(\'collapsed\');document.getElementById(\''+cid+'\').classList.toggle(\'collapsed\')" style="cursor:pointer;margin-bottom:0">'+(icons[cat]||'&#128196;')+' '+cat+' <span class="badge badge-neutral" style="margin-left:auto">'+catKeys.length+'</span> <span class="tpl-arrow">&#9660;</span></div><div id="'+cid+'" class="tpl-category-body collapsed" style="max-height:2000px;margin-top:8px">'+catKeys.map(renderCard).join('')+'</div></div>';
    }).join('')}
    <div class="card"><div class="card-title">&#9999; Custom Template</div>
      <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="c-subj" placeholder="Hi {{name}} - ..."></div>
      <div class="form-group"><label class="form-label">Initial Message</label><textarea class="form-textarea" id="c-init" rows="4"></textarea></div>
      <div class="form-group"><label class="form-label">1st Follow-up</label><textarea class="form-textarea" id="c-f1" rows="2"></textarea></div>
      <div class="form-group"><label class="form-label">Last Follow-up</label><textarea class="form-textarea" id="c-last" rows="2"></textarea></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px"><b>Click to insert tag:</b>
        <span class="tag-btn" onclick="insertTag('c-subj','{{name}}')">{{name}}</span>
        <span class="tag-btn" onclick="insertTag('c-subj','{{company}}')">{{company}}</span>
        <span class="tag-btn" onclick="insertTag('c-subj','{{role_name}}')">{{role_name}}</span>
        <span class="tag-btn" onclick="insertTag('c-subj','{{email}}')">{{email}}</span>
        <span class="tag-btn" onclick="insertTag('c-subj','{{location}}')">{{location}}</span>
        <span class="tag-btn" onclick="insertTag('c-subj','{{platform}}')">{{platform}}</span>
        <span class="tag-btn" onclick="insertTag('c-subj','{{portfolio_link}}')">{{portfolio_link}}</span>
      </div>
      <button class="btn btn-primary" onclick="loadCustomTpl()">Save Custom</button>
    </div></div>`;
}
function filterTemplates(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('[id^="tc-"]').forEach(body => {
    const card = body.parentElement;
    const cards = body.querySelectorAll('.card');
    let visible = 0;
    cards.forEach(c => {
      const text = c.textContent.toLowerCase();
      const match = !q || text.includes(q);
      c.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    card.style.display = visible > 0 || !q ? '' : 'none';
    // Auto-expand matching categories
    if (q && visible > 0) { body.classList.remove('collapsed'); body.previousElementSibling.classList.remove('collapsed'); }
  });
}

function htmlToPlain(html) {
  if (!html) return '';
  return html
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>\s*<li>/gi, '\n- ')
    .replace(/<ul[^>]*>\s*<li>/gi, '\n- ')
    .replace(/<\/li>\s*<\/ul>/gi, '')
    .replace(/<\/?(p|div|ul|ol|li|h[1-6]|br|hr)[^>]*>/gi, '')
    .replace(/<\/?(b|strong)>/gi, '')
    .replace(/<\/?(i|em)>/gi, '')
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function editTemplate(k) {
  const t = await api('/api/templates/' + k);
  if (t.error) { toast(t.error, 'error'); return; }
  showModal(`<div class="modal-title">&#9998; Edit Template: ${esc(t.label)}</div>
    <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="et-label" value="${esc(t.label)}"></div>
    <div class="form-group"><label class="form-label">Category</label><input class="form-input" id="et-category" value="${esc(t.category)}"></div>
    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="et-subject" value="${esc(t.subject)}"></div>
    <div class="form-group"><label class="form-label">Initial Email</label><textarea class="form-textarea" id="et-initial" rows="8" style="line-height:1.6">${htmlToPlain(t.initialMsg)}</textarea></div>
    <div class="form-group"><label class="form-label">1st Follow-up</label><textarea class="form-textarea" id="et-follow1" rows="4" style="line-height:1.6">${htmlToPlain(t.follow1Msg)}</textarea></div>
    <div class="form-group"><label class="form-label">Last Follow-up</label><textarea class="form-textarea" id="et-last" rows="4" style="line-height:1.6">${htmlToPlain(t.lastFollowMsg)}</textarea></div>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Edit in plain text — formatting is added automatically when saved.</p>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px"><b>Click to insert tag:</b>
      <span class="tag-btn" onclick="insertTagEdit('{{name}}')">{{name}}</span>
      <span class="tag-btn" onclick="insertTagEdit('{{company}}')">{{company}}</span>
      <span class="tag-btn" onclick="insertTagEdit('{{role_name}}')">{{role_name}}</span>
      <span class="tag-btn" onclick="insertTagEdit('{{email}}')">{{email}}</span>
      <span class="tag-btn" onclick="insertTagEdit('{{platform}}')">{{platform}}</span>
      <span class="tag-btn" onclick="insertTagEdit('{{portfolio_link}}')">{{portfolio_link}}</span>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTemplate('${k}')">&#10003; Save Changes</button>
    </div>`);
  // Track last focused textarea in edit modal
  document.querySelectorAll('#et-subject,#et-initial,#et-follow1,#et-last').forEach(el => el.addEventListener('focus', () => { window._lastEditField = el; }));
}

function insertTagEdit(tag) {
  const el = window._lastEditField || document.getElementById('et-subject');
  if (!el) return;
  el.focus();
  const start = el.selectionStart || el.value.length;
  const end = el.selectionEnd || el.value.length;
  el.value = el.value.substring(0, start) + tag + el.value.substring(end);
  const pos = start + tag.length;
  el.setSelectionRange(pos, pos);
}

async function saveTemplate(k) {
  const data = {
    label: document.getElementById('et-label').value.trim(),
    category: document.getElementById('et-category').value.trim(),
    subject: document.getElementById('et-subject').value.trim(),
    initialMsg: document.getElementById('et-initial').value,
    follow1Msg: document.getElementById('et-follow1').value,
    lastFollowMsg: document.getElementById('et-last').value
  };
  if (!data.label || !data.subject || !data.initialMsg) { toast('Label, subject and initial message required', 'error'); return; }
  const r = await api('/api/templates/' + k, { method: 'PUT', body: JSON.stringify(data) });
  if (r.error) toast(r.error, 'error');
  else { closeModal(); toast('Template saved! Changes saved to file.', 'success'); navigate('templates'); }
}

async function previewTemplate(k) {
  const t = await api('/api/templates/' + k);
  if (t.error) { toast(t.error, 'error'); return; }
  const sample = { name: 'John Doe', company: 'Acme Corp', role_name: 'Marketing Manager', email: 'john@acme.com', location: 'Bangalore', platform: 'LinkedIn', portfolio_link: 'https://your-portfolio.com' };
  const pSubject = t.subject.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => sample[key] || '{{' + key + '}}');
  const pBody = t.initialMsg.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => sample[key] || '{{' + key + '}}');
  const pFollow1 = (t.follow1Msg || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => sample[key] || '{{' + key + '}}');
  const pLast = (t.lastFollowMsg || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => sample[key] || '{{' + key + '}}');

  showModal(`<div class="modal-title">&#128065; Template Preview — ${t.label}</div>
    <p style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Sample data: John Doe at Acme Corp, Marketing Manager</p>

    <div class="preview-success" style="border:2px solid var(--success);border-radius:8px;padding:15px;margin-bottom:15px;background:#f0fdf4;color:#1e293b">
      <div style="font-weight:700;color:var(--success);margin-bottom:8px">&#9993; Initial Email</div>
      <p style="margin:4px 0"><b>Subject:</b> ${pSubject}</p>
      <hr style="margin:8px 0;border-color:var(--border)">
      <div style="font-size:13px">${pBody}</div>
    </div>

    ${pFollow1 ? `<div class="preview-warning" style="border:2px solid var(--warning);border-radius:8px;padding:15px;margin-bottom:15px;background:#fffbeb;color:#1e293b">
      <div style="font-weight:700;color:var(--warning);margin-bottom:8px">&#128257; 1st Follow-up</div>
      <div style="font-size:13px">${pFollow1}</div>
    </div>` : ''}

    ${pLast ? `<div class="preview-danger" style="border:2px solid var(--danger);border-radius:8px;padding:15px;margin-bottom:15px;background:#fef2f2;color:#1e293b">
      <div style="font-weight:700;color:var(--danger);margin-bottom:8px">&#128257; Last Follow-up</div>
      <div style="font-size:13px">${pLast}</div>
    </div>` : ''}

    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();loadTemplate('${k}')">&#10003; Load This Template</button>
    </div>`);
}

async function loadTemplate(k) { await api('/api/templates/load',{method:'POST',body:JSON.stringify({key:k})}); toast('Template loaded!','success'); navigate('templates'); }
async function loadCustomTpl() {
  const s=document.getElementById('c-subj').value.trim(),i=document.getElementById('c-init').value.trim();
  if(!s||!i){toast('Enter subject + message','error');return;}
  await api('/api/templates/load',{method:'POST',body:JSON.stringify({subject:s,initialMsg:i,follow1Msg:document.getElementById('c-f1').value,lastFollowMsg:document.getElementById('c-last').value})});
  toast('Custom template saved!','success'); navigate('templates');
}

// ═══════════════════ DRAFTS ═══════════════════
async function pgDrafts(el) {
  const stats = await api('/api/stats');
  const ready = stats.withEmail - stats.drafted - stats.sentTotal;
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Create Drafts</div><div class="page-subtitle">${stats.withEmail} with email, ${stats.drafted} drafted</div></div></div>
    ${!stats.hasTemplate ? '<div class="card" class="alert-danger" style="border-left:4px solid var(--danger);color:var(--text)"><b>&#10060; No template loaded!</b> <a href="#" onclick="navigate(\'templates\');return false">Load a template first.</a></div>' : ''}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Ready</div><div class="stat-value">${Math.max(0,ready)}</div></div>
      <div class="stat-card"><div class="stat-label">Drafted</div><div class="stat-value success">${stats.drafted}</div></div>
      <div class="stat-card"><div class="stat-label">Quota Left</div><div class="stat-value warning">${stats.remaining}</div></div>
    </div>
    <div class="card">
      <div class="card-title">&#9993; Draft Actions</div>
      <div class="btn-group" style="margin-bottom:10px">
        <button class="btn btn-success" onclick="pickTemplateThen('single')">&#9989; Single Test</button>
        <button class="btn btn-primary" onclick="pickTemplateThen('bulk')">&#128231; Create Drafts</button>
        <button class="btn btn-outline" onclick="pickTemplateThen('followup')">&#128257; Follow-up</button>
        <button class="btn btn-outline" onclick="sendTestToSelf()">&#128233; Test to Myself</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary)">
        <span>Count:</span><input type="number" id="draft-count" class="form-input" min="1" max="50" value="10" style="width:60px;padding:4px 6px;text-align:center">
        <label style="display:flex;align-items:center;gap:4px" data-tip="Reduces delay from 5-15s to 2-5s between drafts"><input type="checkbox" id="fast-mode"> Fast mode</label>
        <button class="btn btn-sm btn-danger" onclick="api('/api/drafts/stop',{method:'POST'});toast('Stopping...','warning')">Stop</button>
      </div>
      <div id="progress-bar" style="margin-top:10px"></div>
    </div>
  </div>`;
}
async function pickTemplateThen(action) {
  const tpls = await api('/api/templates');
  const active = await api('/api/templates/active/current');
  const keys = Object.keys(tpls);
  const categories = [...new Set(keys.map(k => tpls[k].category))];
  const optionHtml = (arr) => arr.map(k => `<option value="${k}" ${active.hasTemplate && active.subject === tpls[k].subject ? 'selected' : ''}>${tpls[k].label}</option>`).join('');

  showModal(`<div class="modal-title">&#128196; Select Template (${keys.length} available)</div>
    <p style="color:var(--text-secondary);margin-bottom:15px">${active.hasTemplate ? 'Current: "' + esc(active.subject.substring(0, 50)) + '..."' : 'No template loaded. Pick one below.'}</p>
    <div class="form-group">
      <label class="form-label">Choose Template</label>
      <select class="form-select" id="tpl-select" style="font-size:14px">
        <option value="">-- Select a template --</option>
        ${categories.map(cat => '<optgroup label="' + cat + '">' + keys.filter(k => tpls[k].category === cat).map(k => '<option value="' + k + '">' + tpls[k].label + '</option>').join('') + '</optgroup>').join('')}
      </select>
    </div>

    <div style="padding:10px;background:var(--bg);border-radius:8px;margin:10px 0">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
        <input type="radio" name="tpl-source" value="preset" checked> Use selected preset above
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;margin-top:8px">
        <input type="radio" name="tpl-source" value="current" ${active.hasTemplate ? '' : 'disabled'}> Keep current template${active.hasTemplate ? ' ("' + active.subject.substring(0, 30) + '...")' : ' (none loaded)'}
      </label>
    </div>

    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmTemplate('${action}')">Continue &#8594;</button>
    </div>`);
}

async function confirmTemplate(action) {
  const source = document.querySelector('input[name="tpl-source"]:checked').value;

  if (source === 'preset') {
    const key = document.getElementById('tpl-select').value;
    if (!key) { toast('Select a template first', 'error'); return; }
    await api('/api/templates/load', { method: 'POST', body: JSON.stringify({ key }) });
    toast('Template loaded!', 'success');
  }
  // source === 'current' — keep existing template

  closeModal();

  // Now run the action
  if (action === 'single') singleDraft();
  else if (action === 'bulk') bulkDrafts();
  else if (action === 'followup') followUpDrafts();
  else if (action === 'schedule') doScheduleWithStoredTime();
}

async function singleDraft() {
  // First preview, then confirm
  const stats = await api('/api/stats');
  if (!stats.hasTemplate) { toast('Load a template first', 'error'); return; }

  // Get first available contact preview
  const contacts = await api('/api/contacts?limit=50');
  const ready = contacts.contacts.find(c => c.recruiter_email && (!c.email_status || c.email_status === '' || c.email_status === 'Imported from Contacts'));
  if (!ready) { toast('No contacts ready for drafting', 'error'); return; }

  const preview = await api('/api/drafts/preview/' + ready.id);
  if (preview.error) { toast(preview.error, 'error'); return; }

  showModal(`<div class="modal-title">&#128065; Confirm — Create Draft</div>
    <p><b>To:</b> ${preview.to}</p>
    <p><b>Name:</b> ${preview.name} | <b>Company:</b> ${preview.company}</p>
    <p><b>Subject:</b> ${preview.subject}</p>
    <hr style="margin:10px 0">
    <div class="preview-box" style="font-size:13px;max-height:250px;overflow-y:auto;padding:12px;background:var(--bg);border-radius:8px;color:var(--text)">${preview.body}</div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="closeModal();doSingleDraft()">&#10003; Create Draft</button>
    </div>`);
}

async function sendTestToSelf() {
  if (!confirm('Send a test email to yourself using the current template?')) return;
  toast('Sending test to your inbox...', 'info');
  const r = await api('/api/drafts/test-self', { method: 'POST' });
  if (r.error) toast(r.error, 'error');
  else { toast('Test email sent to ' + r.to + '! Check your inbox.', 'success'); playNotificationSound(); }
}

function playNotificationSound() {
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 800; gain.gain.value = 0.1; osc.start(); osc.stop(ctx.currentTime + 0.15); setTimeout(() => { const o2 = ctx.createOscillator(); o2.connect(gain); o2.frequency.value = 1200; o2.start(); o2.stop(ctx.currentTime + 0.15); }, 200); } catch(_) {}
}

async function doSingleDraft() {
  document.getElementById('progress-bar').innerHTML='<div class="loading"><div class="loading-spinner"></div></div>';
  const r=await api('/api/drafts/single',{method:'POST'});
  if(r.error){toast(r.error,'error');document.getElementById('progress-bar').innerHTML='';}
  else{toast((r.method==='sent'?'Email sent to ':'Draft created for ')+r.to,'success');navigate('drafts');}
}
async function bulkDrafts() {
  const count = document.getElementById('draft-count') ? document.getElementById('draft-count').value : '10';
  if(!confirm('Create ' + count + ' drafts with 5-15s delay between each?'))return;
  document.getElementById('progress-bar').innerHTML='<div class="progress-track"><div class="progress-fill" style="width:0%"></div></div><p class="progress-text">Starting...</p>';
  const fast = document.getElementById('fast-mode') ? document.getElementById('fast-mode').checked : false;
  const r=await api('/api/drafts/bulk',{method:'POST',body:JSON.stringify({count:parseInt(count),fast})});
  if(r.error)toast(r.error,'error'); else { toast(`Done! ${r.processed} drafts created. Redirecting to My Drafts...`,'success'); playNotificationSound(); }
  navigate('mydrafts');
}
async function followUpDrafts() {
  if(!confirm('Create follow-up drafts for all sent emails?'))return;
  toast('Creating follow-ups...','info');
  const r=await api('/api/drafts/followup',{method:'POST',body:JSON.stringify({includeFollow1:true,includeLastFollow:true})});
  if(r.error)toast(r.error,'error'); else toast(`Follow-ups: ${r.processed} created, ${r.noThread} no thread, ${r.errors} errors`,'success');
}

// ═══════════════════ MY DRAFTS (Review + Send) ═══════════════════
let draftsPage = 1;
async function pgMyDrafts(el) {
  const data = await api('/api/drafts?page=' + draftsPage + '&limit=20');
  if (data.needLogin) return;
  const stats = await api('/api/stats');
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">&#128233; My Drafts</div><div class="page-subtitle">${data.count} drafts waiting to be reviewed and sent</div></div>
      <div class="btn-group">
        <input type="number" id="send-count" min="1" max="50" value="${Math.min(data.count, 50)}" style="width:60px;text-align:center;font-weight:700;padding:6px;border:1px solid var(--border);border-radius:4px">
        <button class="btn btn-success" onclick="sendAllDrafts()" ${data.count > 0 ? '' : 'disabled'}>&#128640; Send</button>
        <button class="btn btn-primary btn-sm" onclick="sendSelectedDrafts()" id="send-sel-btn" style="display:none">Send Selected</button>
        <button class="btn btn-danger btn-sm" onclick="clearAllDrafts()" ${data.count > 0 ? '' : 'disabled'}>&#128465; Clear All</button>
      </div>
    </div>
    ${data.count === 0 ? '<div class="empty-state"><div class="icon">&#128233;</div><h3>No drafts</h3><p>Create drafts from the Create Drafts page. They\'ll appear here for review before sending.</p></div>' :
    `<div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Pending Drafts</div><div class="stat-value">${data.count}</div></div>
      <div class="stat-card"><div class="stat-label">Quota Left</div><div class="stat-value warning">${stats.remaining}</div></div>
    </div>
    ${data.drafts.map(d => `<div class="card" style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
        <input type="checkbox" class="draft-check" value="${d.id}" onchange="updateDraftSelection()" style="margin-top:4px">
        <div style="flex:1">
          <div style="font-weight:600;margin-bottom:3px">${esc(d.to_email)}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px"><b>Subject:</b> ${esc(d.subject)}</div>
          <div id="draft-body-${d.id}" style="display:none;font-size:13px;padding:12px;background:var(--bg);border-radius:8px;margin-top:8px;color:var(--text)">${d.html_body}</div>
        </div>
        <div class="btn-group" style="flex-shrink:0;margin-left:10px">
          <button class="btn btn-sm btn-outline" onclick="document.getElementById('draft-body-${d.id}').style.display=document.getElementById('draft-body-${d.id}').style.display==='none'?'block':'none'">&#128065;</button>
          <button class="btn btn-sm btn-outline" onclick="editDraft(${d.id})">&#9998;</button>
          <button class="btn btn-sm btn-success" onclick="sendOneDraft(${d.id})">&#128640;</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOneDraft(${d.id})">&#128465;</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Created: ${d.created_at || '-'}</div>
    </div>`).join('')}
    ${data.pages > 1 ? '<div style="display:flex;justify-content:center;gap:10px;margin-top:15px;align-items:center"><button class="btn btn-sm btn-outline" ' + (data.page <= 1 ? 'disabled' : '') + ' onclick="draftsPage--;navigate(\'mydrafts\')">&#8592; Prev</button><span style="color:var(--text-secondary)">Page ' + data.page + ' of ' + data.pages + '</span><button class="btn btn-sm btn-outline" ' + (data.page >= data.pages ? 'disabled' : '') + ' onclick="draftsPage++;navigate(\'mydrafts\')">Next &#8594;</button></div>' : ''}`}
  </div>`;
}

function updateDraftSelection() {
  const checked = [...document.querySelectorAll('.draft-check:checked')].map(c => parseInt(c.value));
  const btn = document.getElementById('send-sel-btn');
  if (btn) { btn.style.display = checked.length > 0 ? 'inline-flex' : 'none'; btn.textContent = 'Send ' + checked.length + ' Selected'; }
}

async function sendSelectedDrafts() {
  const ids = [...document.querySelectorAll('.draft-check:checked')].map(c => parseInt(c.value));
  if (!ids.length) return;
  if (!confirm('Send ' + ids.length + ' selected draft(s) now?')) return;
  toast('Sending ' + ids.length + ' drafts...', 'info');
  let sent = 0, errors = 0;
  for (const id of ids) {
    const r = await api('/api/drafts/' + id + '/send', { method: 'POST' });
    if (r.success) sent++; else errors++;
  }
  toast('Sent: ' + sent + ', Errors: ' + errors, sent > 0 ? 'success' : 'error');
  playNotificationSound();
  navigate('mydrafts');
}

async function editDraft(id) {
  const d = await api('/api/drafts/' + id);
  if (d.error) { toast(d.error, 'error'); return; }
  showModal(`<div class="modal-title">&#9998; Edit Draft</div>
    <div class="form-group"><label class="form-label">To</label><input class="form-input" id="ed-to" value="${esc(d.to_email)}"></div>
    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="ed-subject" value="${esc(d.subject)}"></div>
    <div class="form-group"><label class="form-label">Body (HTML)</label><textarea class="form-textarea" id="ed-body" rows="10">${d.html_body||''}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveDraftEdit(${d.id})">Save Changes</button>
    </div>`);
}

async function saveDraftEdit(id) {
  const r = await api('/api/drafts/' + id, { method: 'PUT', body: JSON.stringify({
    to_email: document.getElementById('ed-to').value.trim(),
    subject: document.getElementById('ed-subject').value.trim(),
    html_body: document.getElementById('ed-body').value
  })});
  if (r.error) toast(r.error, 'error');
  else { closeModal(); toast('Draft updated', 'success'); navigate('mydrafts'); }
}

async function sendOneDraft(id) {
  if (!confirm('Send this draft now?')) return;
  toast('Sending...', 'info');
  const r = await api('/api/drafts/' + id + '/send', { method: 'POST' });
  if (r.error) toast(r.error, 'error');
  else toast('Sent to ' + r.to, 'success');
  navigate('mydrafts');
}

async function sendAllDrafts() {
  const count = document.getElementById('send-count') ? parseInt(document.getElementById('send-count').value) : 50;
  if (!confirm('Send ' + count + ' drafts now?')) return;
  toast('Sending ' + count + ' drafts...', 'info');
  const r = await api('/api/drafts/send-all', { method: 'POST', body: JSON.stringify({ count }) });
  if (r.error) toast(r.error, 'error');
  else { toast('Sent: ' + r.sent + ', Errors: ' + r.errors, 'success'); playNotificationSound(); }
  navigate('mydrafts');
}

async function deleteOneDraft(id) {
  if (!confirm('Delete this draft?')) return;
  await api('/api/drafts/' + id, { method: 'DELETE' });
  toast('Draft deleted', 'success');
  navigate('mydrafts');
}

async function clearAllDrafts() {
  if (!confirm('Delete ALL drafts?')) return;
  await api('/api/drafts/all/clear', { method: 'DELETE' });
  toast('All drafts cleared', 'success');
  navigate('mydrafts');
}

// ═══════════════════ SCHEDULE ═══════════════════
async function pgSchedule(el) {
  const data = await api('/api/schedule');
  const stats = await api('/api/stats');
  const ready = stats.withEmail - stats.drafted - stats.sentTotal - stats.scheduled;
  const tom = new Date(); tom.setDate(tom.getDate()+1);
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Schedule Emails</div><div class="page-subtitle">${data.count} scheduled, ${Math.max(0,ready)} ready to schedule</div></div></div>
    <div class="card"><div class="card-title">&#9200; Schedule New Batch</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:15px">Will schedule <b>${Math.max(0,ready)}</b> emails with 3-5 min random delay between each.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">
        <div class="form-group"><label class="form-label">Start Date</label><input type="date" class="form-input" id="s-date" value="${tom.toISOString().split('T')[0]}"></div>
        <div class="form-group"><label class="form-label">Start Time</label><input type="time" class="form-input" id="s-time" value="09:30"></div>
      </div>
      <div class="btn-group"><button class="btn btn-warning btn-lg" onclick="pickTemplateThenSchedule()">&#9200; Schedule All</button><button class="btn btn-danger" onclick="cancelSched()">&#10060; Cancel All</button></div>
    </div>
    ${data.count>0?`<div class="card"><div class="card-title">&#128197; Pending (${data.count})</div><div class="table-wrap"><table><thead><tr><th>Email</th><th>Scheduled For</th><th>Status</th></tr></thead><tbody>${data.scheduled.map(s=>`<tr><td style="font-size:12px">${s.email}</td><td>${s.scheduled_at_text||new Date(s.scheduled_at).toLocaleString()}</td><td><span class="badge badge-warning">${s.status}</span></td></tr>`).join('')}</tbody></table></div></div>`:''}
  </div>`;
}
async function pickTemplateThenSchedule() {
  const d = document.getElementById('s-date').value;
  const t = document.getElementById('s-time').value;
  if (!d || !t) { toast('Enter date and time first', 'error'); return; }
  window._schedDate = d;
  window._schedTime = t;

  // Show preview first
  toast('Loading preview...', 'info');
  const preview = await api('/api/schedule/preview', { method: 'POST', body: JSON.stringify({ startDate: d, startTime: t }) });
  if (preview.error) { toast(preview.error, 'error'); return; }

  showModal(`<div class="modal-title">&#128197; Schedule Preview</div>
    <div class="stats-grid" style="margin-bottom:15px">
      <div class="stat-card"><div class="stat-label">Total Emails</div><div class="stat-value">${preview.total}</div></div>
      <div class="stat-card"><div class="stat-label">First Email</div><div class="stat-value" style="font-size:14px">${preview.firstEmail}</div></div>
      <div class="stat-card"><div class="stat-label">Last Email</div><div class="stat-value" style="font-size:14px">${preview.lastEmail}</div></div>
    </div>
    <div style="font-weight:700;margin-bottom:8px">First 20 emails:</div>
    <div class="table-wrap" style="max-height:300px;overflow-y:auto"><table><thead><tr><th>Email</th><th>Name</th><th>Subject</th><th>Scheduled For</th></tr></thead><tbody>
    ${preview.preview.map(p => '<tr><td style="font-size:11px">' + esc(p.email) + '</td><td>' + esc(p.name) + '</td><td style="font-size:11px">' + esc(p.subject).substring(0,40) + '</td><td style="font-size:11px">' + p.scheduledFor + '</td></tr>').join('')}
    </tbody></table></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-warning btn-lg" onclick="closeModal();pickTemplateThen('schedule')">&#9200; Confirm & Schedule</button>
    </div>`);
}

async function doScheduleWithStoredTime() {
  const d = window._schedDate, t = window._schedTime;
  if (!d || !t) { toast('Date/time missing', 'error'); return; }
  const r = await api('/api/schedule', { method: 'POST', body: JSON.stringify({ startDate: d, startTime: t }) });
  if (r.error) toast(r.error, 'error'); else toast('Scheduled ' + r.scheduled + '! First: ' + r.firstEmail, 'success');
  navigate('schedule');
}

async function doSchedule() {
  const d=document.getElementById('s-date').value, t=document.getElementById('s-time').value;
  if(!d||!t){toast('Enter date and time','error');return;}
  const r=await api('/api/schedule',{method:'POST',body:JSON.stringify({startDate:d,startTime:t})});
  if(r.error)toast(r.error,'error'); else toast(`Scheduled ${r.scheduled}! First: ${r.firstEmail}`,'success');
  navigate('schedule');
}
async function cancelSched() { if(!confirm('Cancel ALL scheduled?'))return; await api('/api/schedule',{method:'DELETE'}); toast('Cancelled','success'); navigate('schedule'); }

// ═══════════════════ DRY RUN ═══════════════════
async function pgDryRun(el) {
  const d = await api('/api/dryrun');
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Dry Run</div><div class="page-subtitle">${d.ready} ready, quota: ${d.remaining}/${d.quota}</div></div></div>
    ${!d.hasTemplate?'<div class="card" class="alert-danger" style="border-left:4px solid var(--danger);color:var(--text)"><b>No template loaded.</b></div>':''}
    ${d.ready>d.remaining?'<div class="card" class="alert-danger" style="border-left:4px solid var(--danger);color:var(--text)"><b>Warning:</b> '+d.ready+' emails exceed quota of '+d.remaining+'</div>':''}
    <div class="card"><div class="card-title">&#128269; Preview (first 100)</div>
    ${d.preview.length===0?'<div class="empty-state"><div class="icon">&#128269;</div><h3>No emails to preview</h3></div>':`<div class="table-wrap"><table><thead><tr><th>#</th><th>Email</th><th>Name</th><th>Company</th><th>Subject</th></tr></thead><tbody>${d.preview.map((p,i)=>`<tr><td>${i+1}</td><td style="font-size:11px">${p.email}</td><td>${p.name}</td><td>${p.company}</td><td style="font-size:11px">${p.subject}</td></tr>`).join('')}</tbody></table></div>`}
    </div></div>`;
}

// ═══════════════════ BATCH LOG ═══════════════════
async function pgBatchLog(el) {
  const d = await api('/api/batchlog');
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Batch Log</div><div class="page-subtitle">${d.logs.length} entries</div></div></div>
    <div class="card">${d.logs.length===0?'<div class="empty-state"><h3>No batch runs yet</h3></div>':`<div class="table-wrap"><table><thead><tr><th>Timestamp</th><th>Batch ID</th><th>Sent</th><th>Failed</th><th>Retried</th><th>Duration</th><th>Note</th></tr></thead><tbody>${d.logs.map(l=>`<tr><td style="font-size:12px">${l.run_timestamp||'-'}</td><td style="font-size:11px">${(l.batch_id||'').substring(0,15)}</td><td><span class="badge badge-success">${l.sent_count}</span></td><td><span class="badge badge-danger">${l.failed_count}</span></td><td>${l.retried_count}</td><td>${l.duration_ms}ms</td><td style="font-size:11px">${l.note||'-'}</td></tr>`).join('')}</tbody></table></div>`}</div></div>`;
}

// ═══════════════════ SETTINGS ═══════════════════
async function pgSettings(el) {
  const s = await api('/api/settings');
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Settings</div></div></div>
    <div class="card"><div class="card-title">&#128272; Authentication</div>
      <p>Status: ${authStatus.loggedIn?'<span class="badge badge-success">Signed in as '+authStatus.user.email+'</span>':authStatus.smtpConfigured?'<span class="badge badge-info">SMTP configured</span>':'<span class="badge badge-danger">Not configured</span>'}</p>
      ${authStatus.oauthConfigured&&!authStatus.loggedIn?'<br><a href="/auth/google" class="btn btn-google">&#128274; Sign in with Google</a>':''}
      ${authStatus.loggedIn?'<br><a href="/auth/logout" class="btn btn-outline">Logout</a>':''}
    </div>
    <div class="card"><div class="card-title">&#9999; Signature</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Your Gmail signature is automatically fetched when you sign in with Google. You can also set a custom one below.</p>
      <div class="btn-group" style="margin-bottom:12px">
        <button class="btn btn-primary" onclick="fetchGmailSignature()">&#128233; Fetch from Gmail</button>
        <button class="btn btn-outline" onclick="api('/api/settings/signature',{method:'POST',body:JSON.stringify({signature:''})}).then(()=>{toast('Signature cleared','success');navigate('settings')})">Clear Custom</button>
      </div>
      <div class="form-group"><label class="form-label">Custom Signature (overrides Gmail signature)</label>
        <textarea class="form-textarea" id="sig" rows="4" placeholder="Leave empty to use Gmail signature">${s.signature||''}</textarea>
      </div>
      <button class="btn btn-primary" onclick="api('/api/settings/signature',{method:'POST',body:JSON.stringify({signature:document.getElementById('sig').value})}).then(()=>toast('Saved!','success'))">Save Custom Signature</button>
    </div>
    <div class="card"><div class="card-title">&#9881; General</div>
      <div class="form-group"><label class="form-label">Portfolio Link</label><input class="form-input" id="s-port" value="${s.portfolioLink||''}"></div>
      <div class="form-group"><label class="form-label">Default Role Name</label><input class="form-input" id="s-role" value="${s.roleName||''}"></div>
      <button class="btn btn-primary" onclick="api('/api/settings',{method:'POST',body:JSON.stringify({portfolioLink:document.getElementById('s-port').value,roleName:document.getElementById('s-role').value})}).then(()=>toast('Saved!','success'))">Save</button>
    </div>
    <div class="card"><div class="card-title">&#128233; Unsubscribe Link</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Add an unsubscribe notice to all outgoing emails (recommended for compliance).</p>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;margin-bottom:10px">
        <input type="checkbox" id="unsub-enabled" onchange="saveUnsub()"> Enable unsubscribe link
      </label>
      <div class="form-group"><label class="form-label">Custom Text (optional)</label><input class="form-input" id="unsub-text" placeholder='If you no longer wish to receive these emails, reply with "unsubscribe".' onchange="saveUnsub()"></div>
    </div>
    <div class="card"><div class="card-title">&#128260; Reset Email Statuses</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Reset all "Draft Created", "Sent", "Error", "Cancelled" statuses so you can re-draft or re-schedule contacts.</p>
      <button class="btn btn-warning" onclick="resetAllStatuses()">&#128260; Reset All Statuses</button>
    </div>
    <div class="card"><div class="card-title">&#128202; Rate Limits</div>
      <p>Gmail free accounts: <b>500 emails/day</b></p>
      <p>Google Workspace: <b>2,000 emails/day</b></p>
      <p>App configured limit: <b>${config?.DAILY_SEND_LIMIT||50} emails/day</b> (change in config.js)</p>
    </div>
  </div>`;
}

// ═══════════════════ DIAGNOSTIC ═══════════════════
async function pgDiagnostic(el) {
  el.innerHTML = `<div class="fade-in-up"><div class="page-header"><div><div class="page-title">Diagnostic</div></div><div class="btn-group"><button class="btn btn-primary btn-lg" onclick="runDiag()">&#128295; Run All Tests</button><button class="btn btn-warning" onclick="testSmtpSend()">&#128233; Send SMTP Test Email</button></div></div><div id="diag-out"></div></div>`;

  async function testSmtpSend() {
    toast('Sending SMTP test email to your inbox...', 'info');
    const r = await api('/api/test-smtp', { method: 'POST' });
    if (r.error) toast(r.error, 'error');
    else { toast('Test email sent to ' + r.to + '!', 'success'); playNotificationSound(); }
  }
}
async function runDiag() {
  document.getElementById('diag-out').innerHTML='<div class="loading"><div class="loading-spinner"></div></div>';
  const d = await api('/api/diagnostic');
  const icon = s => s==='PASS'?'<span style="color:var(--success)">&#10003;</span>':s==='FAIL'?'<span style="color:var(--danger)">&#10007;</span>':'<span style="color:var(--warning)">&#9888;</span>';
  document.getElementById('diag-out').innerHTML = `<div class="card fade-in-up">
    <div class="card-title">Report — ${d.timestamp}</div>
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-label">Passed</div><div class="stat-value success">${d.passCount}</div></div>
      <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value danger">${d.failCount}</div></div>
      <div class="stat-card"><div class="stat-label">Warnings</div><div class="stat-value warning">${d.warnCount}</div></div>
    </div>
    ${d.results.map((r,i)=>`<div class="diag-row" style="animation-delay:${i*0.04}s">${icon(r.status)} <span class="diag-name">${r.name}</span><span class="badge badge-${r.status==='PASS'?'success':r.status==='FAIL'?'danger':'warning'}">${r.status}</span><span class="diag-detail">${r.detail}</span></div>`).join('')}
    ${d.failCount===0?'<div style="margin-top:15px;padding:12px;background:#d1fae5;border-radius:8px;text-align:center;color:#065f46;font-weight:600">All systems operational!</div>':''}
  </div>`;
}

// ═══════════════════ PROFILE ═══════════════════
async function pgProfile(el) {
  const p = await api('/api/profile');
  if (p.needLogin) return;
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">&#128100; My Profile</div><div class="page-subtitle">${p.email}${p.isAdmin ? ' <span class="badge badge-warning">Admin</span>' : ''}</div></div></div>
    <div class="card">
      <div class="card-title">&#128221; Personal Info</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="pr-name" value="${p.name||''}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="pr-phone" value="${p.phone||''}"></div>
        <div class="form-group"><label class="form-label">Company / Org</label><input class="form-input" id="pr-company" value="${p.company||''}"></div>
        <div class="form-group"><label class="form-label">Role / Title</label><input class="form-input" id="pr-role" value="${p.role||''}"></div>
        <div class="form-group"><label class="form-label">LinkedIn URL</label><input class="form-input" id="pr-linkedin" value="${p.linkedin||''}"></div>
        <div class="form-group"><label class="form-label">Portfolio Link</label><input class="form-input" id="pr-portfolio" value="${p.portfolioLink||''}"></div>
      </div>
      <button class="btn btn-primary" onclick="saveProfile()">Save Profile</button>
    </div>
    <div class="card">
      <div class="card-title">&#128202; My Stats</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Contacts</div><div class="stat-value">${p.contactsCount||0}</div></div>
      </div>
    </div>
  </div>`;
}

async function saveProfile() {
  const r = await api('/api/profile', { method: 'POST', body: JSON.stringify({
    name: document.getElementById('pr-name').value, phone: document.getElementById('pr-phone').value,
    company: document.getElementById('pr-company').value, role: document.getElementById('pr-role').value,
    linkedin: document.getElementById('pr-linkedin').value, portfolioLink: document.getElementById('pr-portfolio').value
  })});
  if (r.success) toast('Profile saved!', 'success'); else toast(r.error || 'Error', 'error');
}

// ═══════════════════ ADMIN PANEL ═══════════════════
async function pgAdmin(el) {
  const data = await api('/api/admin/users');
  if (data.error) { el.innerHTML = '<div class="card"><div class="card-title">&#128274; Admin Access Required</div><p>' + data.error + '</p></div>'; return; }

  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">&#128081; Admin Panel</div><div class="page-subtitle">${data.total} registered users</div></div>
      <button class="btn btn-outline" onclick="viewGlobalAudit()">&#128209; Global Audit Log</button>
    </div>
    <div class="card">
      <div class="card-title">&#128101; All Users</div>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>Email</th><th>Contacts</th><th>Drafted/Sent</th><th>Joined</th><th>Last Login</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>${data.users.map(u => `<tr>
          <td>${u.id}</td>
          <td><b>${u.email}</b></td>
          <td>${u.contacts}</td>
          <td>${u.drafted}</td>
          <td style="font-size:11px">${u.created_at || '-'}</td>
          <td style="font-size:11px">${u.last_login || 'Never'}</td>
          <td>${u.isAdmin ? '<span class="badge badge-warning">Admin</span>' : '<span class="badge badge-neutral">User</span>'}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="viewUserDetail(${u.id})">&#128065; View</button>
            ${!u.isAdmin ? '<button class="btn btn-sm btn-danger" onclick="deleteUser(' + u.id + ')">&#128465;</button>' : ''}
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
}

async function viewUserDetail(uid) {
  const u = await api('/api/admin/users/' + uid);
  if (u.error) { toast(u.error, 'error'); return; }
  showModal(`<div class="modal-title">&#128100; User: ${u.email}</div>
    <div class="stats-grid" style="margin-bottom:15px">
      <div class="stat-card"><div class="stat-label">Contacts</div><div class="stat-value">${u.contacts}</div></div>
      <div class="stat-card"><div class="stat-label">With Email</div><div class="stat-value">${u.withEmail}</div></div>
      <div class="stat-card"><div class="stat-label">Drafted</div><div class="stat-value success">${u.drafted}</div></div>
      <div class="stat-card"><div class="stat-label">Sent</div><div class="stat-value warning">${u.sent}</div></div>
      <div class="stat-card"><div class="stat-label">Scheduled</div><div class="stat-value">${u.scheduled}</div></div>
      <div class="stat-card"><div class="stat-label">Blocked</div><div class="stat-value danger">${u.blocklist}</div></div>
    </div>
    <div style="font-weight:700;margin-bottom:8px">Recent Activity</div>
    ${u.recentAudit && u.recentAudit.length > 0 ? u.recentAudit.map(a => `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px"><span class="badge badge-info">${a.action}</span><span style="flex:1">${a.detail||''}</span><span style="color:var(--text-muted)">${a.created_at||''}</span></div>`).join('') : '<p style="color:var(--text-muted)">No activity</p>'}
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="closeModal();viewUserContacts(${uid})">View Contacts</button></div>`);
}

async function viewUserContacts(uid) {
  const data = await api('/api/admin/users/' + uid + '/contacts?limit=20');
  if (data.error) { toast(data.error, 'error'); return; }
  showModal(`<div class="modal-title">&#128101; User #${uid} Contacts (${data.total})</div>
    ${data.contacts.length === 0 ? '<p>No contacts</p>' :
    `<div class="table-wrap" style="max-height:400px;overflow-y:auto"><table><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Status</th></tr></thead><tbody>
    ${data.contacts.map(c => `<tr><td>${c.recruiter_name||'-'}</td><td style="font-size:11px">${c.recruiter_email||'-'}</td><td>${c.company||'-'}</td><td><span class="badge badge-neutral">${(c.email_status||'-').substring(0,25)}</span></td></tr>`).join('')}
    </tbody></table></div>`}
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
}

async function viewGlobalAudit() {
  const data = await api('/api/admin/audit');
  if (data.error) { toast(data.error, 'error'); return; }
  showModal(`<div class="modal-title">&#128209; Global Audit Log (last 200)</div>
    <div class="table-wrap" style="max-height:500px;overflow-y:auto"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th><th>IP</th></tr></thead><tbody>
    ${(data.logs||[]).map(l => `<tr><td style="font-size:10px;white-space:nowrap">${l.created_at||'-'}</td><td style="font-size:11px">${l.user_email||'#'+l.user_id}</td><td><span class="badge badge-info">${l.action}</span></td><td style="font-size:11px">${l.detail||'-'}</td><td style="font-size:10px">${l.ip||'-'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
}

async function deleteUser(uid) {
  if (!confirm('Delete this user and ALL their data? This cannot be undone.')) return;
  const r = await api('/api/admin/users/' + uid, { method: 'DELETE' });
  if (r.error) toast(r.error, 'error'); else { toast('User deleted', 'success'); navigate('admin'); }
}

async function fetchGmailSignature() {
  toast('Fetching signature from Gmail...', 'info');
  const r = await api('/api/settings/fetch-gmail-signature', { method: 'POST' });
  if (r.error) toast(r.error, 'error');
  else if (r.signature) { toast('Gmail signature fetched! (' + r.length + ' chars)', 'success'); navigate('settings'); }
  else toast(r.message || 'No signature found in Gmail', 'warning');
}

async function saveUnsub() {
  const enabled = document.getElementById('unsub-enabled').checked;
  const text = document.getElementById('unsub-text').value;
  await api('/api/settings/unsubscribe', { method: 'POST', body: JSON.stringify({ enabled, text }) });
  toast(enabled ? 'Unsubscribe link enabled' : 'Unsubscribe link disabled', 'success');
}

async function resetAllStatuses() {
  const stats = await api('/api/stats');
  if (!confirm('Reset email status for ALL ' + (stats.total || 0) + ' contacts?\n\nThis clears Draft Created, Sent, Error, Cancelled statuses so you can re-draft them.\n\nThis cannot be undone.')) return;
  const r = await api('/api/contacts/bulk-reset', { method: 'POST', body: JSON.stringify({ ids: [] }) });
  if (r.error) toast(r.error, 'error'); else toast('All statuses reset!', 'success');
}

// ═══════════════════ AUDIT LOG ═══════════════════
async function pgAudit(el) {
  const d = await api('/api/audit');
  if (d.needLogin) return;
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Audit Log</div><div class="page-subtitle">All actions tracked</div></div>
      <a href="/api/backup" class="btn btn-outline">&#128190; Download Backup</a>
    </div>
    <div class="card">${!d.logs || d.logs.length === 0 ? '<div class="empty-state"><h3>No activity yet</h3></div>' :
    `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Detail</th><th>IP</th></tr></thead><tbody>
    ${d.logs.map(l => `<tr><td style="font-size:11px;white-space:nowrap">${l.created_at || '-'}</td><td><span class="badge badge-info">${l.action}</span></td><td style="font-size:12px">${l.detail || '-'}</td><td style="font-size:11px;color:var(--text-secondary)">${l.ip || '-'}</td></tr>`).join('')}
    </tbody></table></div>`}</div></div>`;
}

// ═══════════════════ BLOCKLIST ═══════════════════
async function pgBlocklist(el) {
  const d = await api('/api/blocklist');
  if (d.needLogin) return;
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">Blocklist</div><div class="page-subtitle">Blocked domains/emails won't receive drafts or scheduled emails</div></div></div>
    <div class="card">
      <div class="card-title">&#10010; Add Entry</div>
      <div style="display:flex;gap:10px;align-items:end">
        <div class="form-group" style="flex:1;margin:0"><label class="form-label">Domain or Email</label><input class="form-input" id="bl-pattern" placeholder="example.com or spam@example.com"></div>
        <div class="form-group" style="margin:0"><label class="form-label">Type</label><select class="form-select" id="bl-type"><option value="domain">Domain</option><option value="email">Email</option></select></div>
        <button class="btn btn-danger" onclick="addBlock()">Block</button>
      </div>
    </div>
    <div class="card"><div class="card-title">&#128683; Blocked (${(d.list||[]).length})</div>
    ${!d.list || d.list.length === 0 ? '<p style="color:var(--text-secondary)">No entries. Emails from all domains are allowed.</p>' :
    `<div class="table-wrap"><table><thead><tr><th>Pattern</th><th>Type</th><th>Added</th><th>Action</th></tr></thead><tbody>
    ${d.list.map(b => `<tr><td><b>${b.pattern}</b></td><td><span class="badge badge-neutral">${b.type}</span></td><td style="font-size:11px">${b.created_at||'-'}</td><td><button class="btn btn-sm btn-outline" onclick="removeBlock(${b.id})">Remove</button></td></tr>`).join('')}
    </tbody></table></div>`}</div></div>`;
}

async function addBlock() {
  const pattern = document.getElementById('bl-pattern').value.trim();
  if (!pattern) { toast('Enter a domain or email', 'error'); return; }
  const r = await api('/api/blocklist', { method: 'POST', body: JSON.stringify({ pattern, type: document.getElementById('bl-type').value }) });
  if (r.error) toast(r.error, 'error'); else { toast('Blocked: ' + pattern, 'success'); navigate('blocklist'); }
}

async function removeBlock(id) {
  await api('/api/blocklist/' + id, { method: 'DELETE' });
  toast('Removed', 'success');
  navigate('blocklist');
}

// ═══════════════════ USER GUIDE ═══════════════════
function pgGuide(el) {
  el.innerHTML = `<div class="fade-in-up">
    <div class="page-header"><div><div class="page-title">&#128214; User Guide</div><div class="page-subtitle">Everything you need to know</div></div></div>

    <div class="card" style="border-left:4px solid var(--primary);padding:20px">
      <div class="card-title" style="margin-bottom:10px">&#9889; Quick Start (3 Steps)</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:14px">
        <div style="display:flex;align-items:center;gap:10px"><span class="badge badge-info" style="min-width:24px;justify-content:center">1</span><b>Import contacts</b> — Go to Contacts, click Import, upload your .xlsx or .csv file</div>
        <div style="display:flex;align-items:center;gap:10px"><span class="badge badge-info" style="min-width:24px;justify-content:center">2</span><b>Pick a template</b> — Go to Templates, expand a category, click Load</div>
        <div style="display:flex;align-items:center;gap:10px"><span class="badge badge-info" style="min-width:24px;justify-content:center">3</span><b>Create drafts</b> — Go to Create Drafts, click Single Test to verify, then Create Drafts for bulk</div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:10px">Drafts are saved locally — review them in My Drafts before sending.</p>
    </div>

    <div class="card"><div class="card-title">&#9312; Initial Setup</div>
      <ol style="line-height:2.2;color:var(--text-secondary)">
        <li>Install <a href="https://nodejs.org" target="_blank" style="color:var(--primary)">Node.js</a> (LTS version)</li>
        <li>Open terminal, navigate to the standalone folder: <code>cd standalone</code></li>
        <li>Run <code>npm install</code> to install dependencies</li>
        <li>Edit <code>.env</code> file with your Gmail credentials:
          <ul style="margin:5px 0 5px 20px"><li><b>SMTP (simple):</b> Set <code>SMTP_USER</code> and <code>SMTP_PASS</code> (Gmail App Password)</li>
          <li><b>OAuth (full features):</b> Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code></li></ul></li>
        <li>Set <code>ADMIN_EMAIL</code> to your email for admin access</li>
        <li>Run <code>node server.js</code> and open <b>http://localhost:3000</b></li>
        <li>Login with OTP (enter email → receive code → verify)</li>
        <li>Run <b>Diagnostic</b> to verify everything is connected</li>
      </ol>
    </div>

    <div class="card"><div class="card-title">&#9313; Gmail App Password (SMTP)</div>
      <ol style="line-height:2.2;color:var(--text-secondary)">
        <li>Go to <a href="https://myaccount.google.com/security" target="_blank" style="color:var(--primary)">Google Account Security</a></li>
        <li>Enable <b>2-Step Verification</b> if not already on</li>
        <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:var(--primary)">App Passwords</a></li>
        <li>Generate a password for "Mail" on "Windows"</li>
        <li>Copy the 16-character password (remove spaces)</li>
        <li>Put it in <code>.env</code> as <code>SMTP_PASS=abcdefghijklmnop</code></li>
      </ol>
      <p style="font-size:12px;color:var(--warning);margin-top:8px"><b>Note:</b> SMTP can send emails but cannot create Gmail drafts. Use OAuth for drafts.</p>
    </div>

    <div class="card"><div class="card-title">&#9314; Google OAuth Setup (for Gmail Drafts)</div>
      <ol style="line-height:2.2;color:var(--text-secondary)">
        <li>Go to <a href="https://console.cloud.google.com" target="_blank" style="color:var(--primary)">Google Cloud Console</a></li>
        <li>Create a new project named "Email Automation"</li>
        <li>Enable <b>Gmail API</b> in APIs & Services → Library</li>
        <li>Set up <b>OAuth Consent Screen</b> → External → Add your email as test user</li>
        <li>Create <b>OAuth Client ID</b> → Web Application</li>
        <li>Set redirect URI: <code>http://localhost:3000/auth/google/callback</code></li>
        <li>Copy Client ID and Secret to <code>.env</code></li>
        <li>Restart server and click "Link Google" in sidebar</li>
      </ol>
    </div>

    <div class="card"><div class="card-title">&#9315; Import Contacts</div>
      <ol style="line-height:2.2;color:var(--text-secondary)">
        <li>Go to <b>Contacts</b> and click <b>Import</b></li>
        <li>Upload <b>.xlsx</b> or <b>.csv</b> file (max 10MB)</li>
        <li>Auto-detects columns: Name, Company, Email, Role, LinkedIn, Phone</li>
        <li>Duplicates are skipped automatically (by email)</li>
        <li>Blocked domains/emails are also skipped</li>
        <li>Download <b>CSV Template</b> to see the expected format</li>
        <li>You can also <b>Add</b> contacts manually one by one</li>
        <li><b>Export</b> downloads all contacts as CSV</li>
      </ol>
    </div>

    <div class="card"><div class="card-title">&#9316; Email Templates</div>
      <ol style="line-height:2.2;color:var(--text-secondary)">
        <li>Go to <b>Templates</b> page</li>
        <li>Click <b>Preview</b> to see the full email with sample data before loading</li>
        <li>Click <b>Load</b> to activate a template</li>
        <li>8 presets available: 4 Job Application + 4 Cold Outreach</li>
        <li>Write your own in the <b>Custom Template</b> section</li>
        <li><b>Template is required</b> before creating drafts or scheduling</li>
      </ol>
      <p style="font-size:13px;margin-top:8px"><b>Personalization Tags:</b> <code>{{name}}</code> <code>{{company}}</code> <code>{{role_name}}</code> <code>{{email}}</code> <code>{{location}}</code> <code>{{platform}}</code> <code>{{portfolio_link}}</code></p>
    </div>

    <div class="card"><div class="card-title">&#9317; Creating Drafts</div>
      <ol style="line-height:2.2;color:var(--text-secondary)">
        <li>Go to <b>Create Drafts</b> page</li>
        <li>Click any action → <b>Template picker</b> appears first</li>
        <li><b>Single Test Draft:</b> Shows preview → confirm → creates 1 draft</li>
        <li><b>Bulk Drafts:</b> Creates up to 50 with 5-15s delay between each</li>
        <li><b>Follow-up Drafts:</b> Creates replies in original thread (Gmail API only)</li>
        <li><b>Stop:</b> Halts creation mid-run</li>
        <li>Progress bar shows real-time status via Server-Sent Events</li>
      </ol>
      <p style="font-size:12px;color:var(--warning);margin-top:8px"><b>SMTP mode:</b> "Create Draft" actually sends the email directly (SMTP can't create drafts). Use OAuth to create actual Gmail drafts.</p>
    </div>

    <div class="card"><div class="card-title">&#9318; Scheduling Emails</div>
      <ol style="line-height:2.2;color:var(--text-secondary)">
        <li>Go to <b>Schedule</b> page</li>
        <li>Pick a <b>start date and time</b> (must be in the future)</li>
        <li>Click <b>Schedule All</b> → template picker → confirm</li>
        <li>Each email is staggered by <b>3-5 minutes</b> randomly</li>
        <li>Shows first and last email times before confirming</li>
        <li>View all pending emails in the table below</li>
        <li><b>Cancel All</b> removes all pending scheduled emails</li>
      </ol>
    </div>

    <div class="card"><div class="card-title">&#9319; Bulk Actions</div>
      <ul style="line-height:2.2;color:var(--text-secondary)">
        <li><b>Select contacts</b> with checkboxes → bulk action bar appears</li>
        <li><b>Draft Selected:</b> Create drafts only for selected contacts</li>
        <li><b>Reset Status:</b> Clear email status so contacts can be re-drafted</li>
        <li><b>Delete Selected:</b> Remove selected contacts from database</li>
        <li><b>Select All:</b> Checkbox in header selects all visible contacts</li>
      </ul>
    </div>

    <div class="card"><div class="card-title">&#9320; Security Features</div>
      <ul style="line-height:2.2;color:var(--text-secondary)">
        <li><b>OTP Login:</b> Email-based one-time password, expires in 5 minutes</li>
        <li><b>Session Timeout:</b> Auto-logout after 10 minutes of inactivity</li>
        <li><b>Per-User Isolation:</b> Each user only sees their own data</li>
        <li><b>Rate Limiting:</b> 120 requests/min, 5 OTP attempts/5min</li>
        <li><b>Helmet.js:</b> Secure HTTP headers (XSS, clickjacking protection)</li>
        <li><b>Input Sanitization:</b> Strips malicious HTML from all inputs</li>
        <li><b>File Validation:</b> Only .xlsx/.xls/.csv, max 10MB</li>
        <li><b>Blocklist:</b> Block domains or individual emails</li>
        <li><b>Audit Log:</b> Every action tracked with timestamp and IP</li>
        <li><b>Admin Panel:</b> Admin can view all users and their data</li>
      </ul>
    </div>

    <div class="card"><div class="card-title">&#9321; Keyboard Shortcuts</div>
      <div style="display:grid;grid-template-columns:80px 1fr;gap:6px;color:var(--text-secondary);font-size:13px">
        <code>H</code><span>Dashboard (Home)</span>
        <code>C</code><span>Contacts</span>
        <code>T</code><span>Templates</span>
        <code>D</code><span>Create Drafts</span>
        <code>S</code><span>Schedule</span>
        <code>R</code><span>Dry Run</span>
        <code>?</code><span>User Guide</span>
        <code>Esc</code><span>Close modal/dialog</span>
      </div>
    </div>

    <div class="card" style="border-left:4px solid var(--danger)"><div class="card-title">&#128295; Troubleshooting — Common Issues</div>
      <div style="color:var(--text-secondary);line-height:2">
        <p><b>&#10060; "SMTP not configured"</b><br>Edit <code>.env</code> file and set <code>SMTP_USER</code> (your Gmail) and <code>SMTP_PASS</code> (app password). Restart server.</p>
        <p><b>&#10060; "No template loaded"</b><br>Go to Templates page and click Load on any preset. Template is required before drafts/scheduling.</p>
        <p><b>&#10060; "No contacts ready"</b><br>Import contacts first, or reset email statuses if all contacts are already "Draft Created" or "Sent". Go to Settings → Reset All Statuses.</p>
        <p><b>&#10060; App password doesn't work</b><br>Make sure 2-Step Verification is ON in Google account. Generate a new App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:var(--primary)">myaccount.google.com/apppasswords</a>.</p>
        <p><b>&#10060; OAuth "Access denied"</b><br>Add your email as a test user in Google Cloud Console → OAuth Consent Screen → Audience → Test Users.</p>
        <p><b>&#10060; "Too many requests"</b><br>Rate limiter is active (120 req/min). Wait 1 minute and try again.</p>
        <p><b>&#10060; Port 3000 in use</b><br>Change <code>PORT=3001</code> in <code>.env</code> or run <code>npx kill-port 3000</code>.</p>
        <p><b>&#10060; Session expired</b><br>Session timeout is 10 minutes. Log in again with OTP.</p>
        <p><b>&#10060; CSV import shows 0 contacts</b><br>Your CSV may have a title row above the headers. The app auto-detects the header row (must contain "Name" and "Email" or "Company").</p>
        <p><b>&#10060; Drafts go to Sent instead of Drafts</b><br>You're on SMTP mode (sends directly). Sign in with Google OAuth to create actual Gmail drafts.</p>
        <p><b>&#10060; Can't see admin panel</b><br>Set <code>ADMIN_EMAIL=your-email@gmail.com</code> in <code>.env</code> to match your login email.</p>
        <p><b>&#10060; Blocked contacts still in list</b><br>Blocklist prevents new drafts/schedules/imports — it doesn't delete existing contacts. Delete them manually or via bulk actions.</p>
      </div>
    </div>

    <div class="card"><div class="card-title">&#128161; Tips & Best Practices</div>
      <ul style="line-height:2.2;color:var(--text-secondary)">
        <li>Always <b>Dry Run</b> before creating drafts to verify personalization</li>
        <li>Start with <b>Single Test Draft</b> to check formatting in Gmail</li>
        <li>Enable <b>Unsubscribe link</b> in Settings for email compliance</li>
        <li>Use <b>Blocklist</b> to prevent sending to competitors or certain domains</li>
        <li><b>Check Replies</b> regularly to track who responded</li>
        <li><b>Back up</b> your database from the Audit Log page</li>
        <li>Gmail free limit: <b>500/day</b>, Workspace: <b>2,000/day</b>, App limit: <b>50/day</b> (configurable)</li>
        <li>Use <b>Dark Mode</b> for comfortable late-night emailing</li>
      </ul>
    </div>
  </div>`;
}

init();
