module.exports = {
  PORT: process.env.PORT || 3000,

  // Delays
  MIN_DELAY_MS: 5000,
  MAX_DELAY_MS: 15000,
  SCHEDULE_STAGGER_MIN_MS: 3 * 60 * 1000,
  SCHEDULE_STAGGER_MAX_MS: 5 * 60 * 1000,

  // Limits
  MAX_DRAFTS_PER_RUN: 50,
  BATCH_SIZE: 10,
  DAILY_SEND_LIMIT: 50,
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 60 * 1000,

  HEADERS: [
    '#', 'Date Applied', 'Company', 'Recruiter Name', 'Job Title',
    'Recruiter Email', 'Location', 'Work Mode', 'Job Type', 'Platform',
    'Source URL', 'Status', 'Priority', 'Salary', 'Phone Screen',
    'Interview 1', 'Interview 2', 'Final Round', 'Offer Date', 'ATS Score',
    'Email Status', 'Schedule Date', 'Schedule Time', 'Tracking', 'Notes'
  ],

  DEFAULT_SIGNATURE: process.env.DEFAULT_SIGNATURE || '<br><br>' +
    '<div style="font-family:Arial,sans-serif;font-size:13px;color:#555;">' +
    '<b>Your Name</b><br>' +
    'Your Title<br>' +
    'Your Location<br>' +
    '<a href="https://www.linkedin.com/in/your-profile" style="color:#1a73e8;">LinkedIn</a>' +
    '</div>',

  SESSION_SECRET: process.env.SESSION_SECRET || 'email-auto-secret-' + Date.now(),

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',

  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',

  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
};
