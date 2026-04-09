# Email Automation Engine

A job application email automation system with two implementations:

1. **Google Apps Script** (`Code_Rewritten.gs`) — runs inside Google Sheets with a built-in UI (sidebars, modals, triggers)
2. **Standalone Node.js Web App** (`standalone/`) — a self-hosted Express server with a browser-based UI

---

## Features

- **Contact Management** — Import contacts from `.xlsx`, `.xls`, or `.csv` files; add/edit/delete manually; search & paginate; export to CSV
- **Email Templates** — Pre-built templates (formal, friendly, job-post, referral, LinkedIn) with `{{name}}`, `{{company}}`, `{{role_name}}` personalization placeholders
- **Draft Generation** — Create email drafts one at a time or in bulk with randomized delays to avoid spam detection
- **Scheduled Sending** — Schedule emails with staggered send times; background scheduler checks every 30 seconds for due emails
- **Daily Send Limits** — Configurable daily cap (default 50) with automatic counter reset
- **Retry Logic** — Failed emails are retried up to 2 times with a 1-minute delay
- **Email Blocklist** — Block specific emails or entire domains
- **Audit Log** — Tracks all actions (logins, imports, sends, edits) with timestamps and IP addresses
- **Real-time Progress** — Server-Sent Events (SSE) for live progress updates during bulk operations
- **Unsubscribe Footer** — Optional unsubscribe text appended to outgoing emails

## Google Apps Script Version

The Apps Script version (`Code_Rewritten.gs`) is designed to run as a bound script inside a Google Sheets spreadsheet with these sheets:

| Sheet | Purpose |
|---|---|
| Job Tracker | Main contact/application data (columns A-Y) |
| Contacts | Networking contacts (columns A-J) |
| Data | Email templates (subject, initial, follow-up, last follow-up) |
| Email Log | Send history and status tracking |

### Key capabilities

- Custom menu and sidebar UI within Google Sheets
- Gmail draft creation and direct sending via `GmailApp` / `MailApp`
- Time-based triggers for scheduled batch sends and safety checks
- Open/click tracking via a deployed web app endpoint
- Daily send counter using `PropertiesService`

## Standalone Web App

### Tech Stack

- **Runtime**: Node.js
- **Server**: Express
- **Database**: SQLite via sql.js (file: `data/tracker.db`)
- **Email**: Nodemailer (SMTP) or Gmail API (OAuth 2.0)
- **Auth**: OTP-based email login or Google OAuth
- **Security**: Helmet, rate limiting, session management, input sanitization

### Project Structure

```
standalone/
  server.js            # Express app, all API routes
  config.js            # Environment variables and defaults
  db.js                # SQLite database layer (sql.js)
  email-sender.js      # SMTP and Gmail API email sending
  template-engine.js   # Placeholder personalization and HTML utilities
  importer.js          # Excel/CSV file parsing
  scheduler.js         # Background email scheduler (30s interval)
  data/
    templates.json     # Pre-built email templates
    tracker.db         # SQLite database (auto-created)
  public/
    index.html         # SPA entry point
    app.js             # Frontend JavaScript
    style.css          # Styles
  uploads/             # Temporary file upload directory
```

### Setup

1. **Install dependencies**:
   ```bash
   cd standalone
   npm install
   ```

2. **Configure environment** — create `standalone/.env`:
   ```env
   # SMTP (Gmail App Password)
   SMTP_USER=you@gmail.com
   SMTP_PASS=your-app-password

   # OR Google OAuth (for Gmail API drafts/sending)
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

   # Optional
   PORT=3000
   SESSION_SECRET=your-secret
   TIMEZONE=Asia/Kolkata
   ADMIN_EMAILS=you@gmail.com
   ```

3. **Start the server**:
   ```bash
   npm start        # production
   npm run dev      # development (auto-restart on changes)
   ```

4. **Open** `http://localhost:3000` in your browser.

### API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/auth/send-otp` | Send login OTP |
| POST | `/auth/verify-otp` | Verify OTP and log in |
| GET | `/auth/google` | Start Google OAuth flow |
| GET | `/auth/status` | Check login and config status |
| GET | `/api/contacts` | List contacts (paginated, searchable) |
| POST | `/api/contacts/add` | Add a single contact |
| POST | `/api/contacts/import` | Import contacts from file |
| GET | `/api/contacts/export` | Export contacts as CSV |
| PUT | `/api/contacts/:id` | Update a contact |
| DELETE | `/api/contacts/:id` | Delete a contact |
| GET | `/api/templates` | List all templates |
| POST | `/api/templates/load` | Activate a template |
| PUT | `/api/templates/:key` | Edit a template |
| POST | `/api/drafts/single` | Create one draft |
| POST | `/api/drafts/bulk` | Create drafts in bulk |
| POST | `/api/drafts/:id/send` | Send a specific draft |
| POST | `/api/drafts/send-all` | Send all pending drafts |
| POST | `/api/drafts/test-self` | Send test email to yourself |
| POST | `/api/schedule/preview` | Preview scheduled send times |
| POST | `/api/schedule/start` | Start scheduled sending |
| POST | `/api/schedule/cancel` | Cancel all scheduled emails |
| GET | `/api/progress` | SSE stream for real-time progress |

### Database Tables

| Table | Purpose |
|---|---|
| `users` | Registered users with OTP fields |
| `contacts` | Job application contacts (per user) |
| `email_log` | Scheduled/sent email records |
| `batch_log` | Batch run summaries |
| `drafts` | Local email drafts for review before sending |
| `settings` | Per-user key-value settings |
| `audit_log` | Action history |
| `blocklist` | Blocked emails/domains |

## Personalization

Templates support these placeholders which are auto-replaced per contact:

| Tag | Description |
|---|---|
| `{{name}}` | Recruiter / contact name |
| `{{company}}` | Company name |
| `{{role_name}}` | Job title / role |
| `{{email}}` | Recruiter email |
| `{{location}}` | Job location |
| `{{platform}}` | Source platform (LinkedIn, Naukri, etc.) |
| `{{portfolio_link}}` | Your portfolio URL (configurable in Settings) |

Set your portfolio link, default role name, and email signature in the Settings panel after logging in.

## License

Private project.
