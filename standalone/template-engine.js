const config = require('./config');

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// HTML-escape user-provided template values so a contact name like
// `<img onerror=alert(1)>` cannot inject into the rendered email.
function htmlEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip CR/LF — used for any value going into a header (Subject, From, To).
// Header injection (BCC the world) becomes impossible if newlines never appear.
function stripCrlf(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[\r\n]+/g, ' ').trim();
}

// Throws if value contains CR/LF — call this for outgoing header values where
// silent stripping would mask a programming bug elsewhere.
function assertNoCrlf(name, s) {
  if (typeof s === 'string' && /[\r\n]/.test(s)) {
    throw new Error('Header injection: CR/LF in ' + name);
  }
  return s;
}

// Replace {{var}} placeholders.
//   - subject lines (`skipHtmlWrap=true`)  → strip CR/LF from values
//   - HTML bodies   (default)              → HTML-escape values
function personalizeMessage(template, data, skipHtmlWrap) {
  if (!template) return '';
  let out = template;
  for (const key in data) {
    const raw = data[key];
    const safe = skipHtmlWrap ? stripCrlf(raw) : htmlEscape(raw);
    out = out.replace(new RegExp('{{\\s*' + key + '\\s*}}', 'g'), safe);
  }
  if (!skipHtmlWrap && !out.match(/<\/?[a-z][\s\S]*>/i)) {
    out = out.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('\n');
  }
  return out.trim();
}

// Allow plain text + a narrow whitelist of inline tags (a, b, i, em, strong, br).
// Used for user-controlled unsubscribe text that gets appended to outgoing email.
function sanitizeUnsubText(s) {
  if (!s) return '';
  // Drop <script>, <style>, etc., and their contents entirely.
  let out = String(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  // Strip every tag except the whitelist.
  out = out.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag) => {
    const t = tag.toLowerCase();
    if (['a', 'b', 'i', 'em', 'strong', 'br'].includes(t)) {
      if (t === 'a') {
        // Keep only a safe href and visible text.
        const hrefMatch = m.match(/\bhref\s*=\s*["']([^"']*)["']/i);
        const href = hrefMatch ? hrefMatch[1] : '';
        if (/^(https?:|mailto:)/i.test(href)) return '<a href="' + href.replace(/"/g, '&quot;') + '">';
        if (/^<\/a/i.test(m)) return '</a>';
        return '';
      }
      return m.startsWith('</') ? '</' + t + '>' : '<' + t + '>';
    }
    return '';
  });
  // Neuter on* event-handler attributes that slipped through.
  return out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
}

function stripHtml(html) {
  return html
    ? String(html).replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    : '';
}

function wrapPlainTextAsHtml(text) {
  if (!text || !text.trim()) return '';
  if (text.match(/<\/?[a-z][\s\S]*>/i)) return text;
  return text.split(/\n{2,}/).map(p => '<p>' + p.trim().replace(/\n/g, '<br>') + '</p>').join('\n');
}

function getPersonalizationData(contact) {
  return {
    email: contact.recruiter_email || '',
    name: contact.recruiter_name || '',
    company: contact.company || '',
    role_name: contact.job_title || '',
    location: contact.location || '',
    platform: contact.platform || '',
    portfolio_link: contact.portfolio_link || ''
  };
}

function getRandomDelay() {
  return Math.floor(Math.random() * (config.MAX_DELAY_MS - config.MIN_DELAY_MS + 1)) + config.MIN_DELAY_MS;
}

function getRandomStaggerMs() {
  return Math.floor(Math.random() * (config.SCHEDULE_STAGGER_MAX_MS - config.SCHEDULE_STAGGER_MIN_MS + 1)) + config.SCHEDULE_STAGGER_MIN_MS;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  isValidEmail, personalizeMessage, stripHtml, wrapPlainTextAsHtml,
  getPersonalizationData, getRandomDelay, getRandomStaggerMs, sleep,
  htmlEscape, stripCrlf, assertNoCrlf, sanitizeUnsubText
};
