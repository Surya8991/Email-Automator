const config = require('./config');

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function personalizeMessage(template, data, skipHtmlWrap) {
  if (!template) return '';
  let out = template;
  for (const key in data) {
    out = out.replace(new RegExp('{{\\s*' + key + '\\s*}}', 'g'), data[key] || '');
  }
  if (!skipHtmlWrap && !out.match(/<\/?[a-z][\s\S]*>/i)) {
    out = out.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('\n');
  }
  return out.trim();
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
  getPersonalizationData, getRandomDelay, getRandomStaggerMs, sleep
};
