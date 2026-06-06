import { sqliteTable, integer, text, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── Auth.js standard tables ─────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').unique().notNull(),
  name: text('name'),
  image: text('image'),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export const accounts = sqliteTable('accounts', {
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) }))

export const sessions = sqliteTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
})

export const verificationTokens = sqliteTable('verificationTokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }))

// ── App tables ──────────────────────────────────────────────────────────
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  num: integer('num'),
  company: text('company').notNull().default(''),
  recruiterName: text('recruiter_name').notNull().default(''),
  jobTitle: text('job_title').notNull().default(''),
  recruiterEmail: text('recruiter_email').notNull().default(''),
  location: text('location').notNull().default(''),
  workMode: text('work_mode').notNull().default(''),
  jobType: text('job_type').notNull().default(''),
  platform: text('platform').notNull().default(''),
  sourceUrl: text('source_url').notNull().default(''),
  status: text('status').notNull().default('Not Applied'),
  priority: text('priority').notNull().default(''),
  salary: text('salary').notNull().default(''),
  emailStatus: text('email_status').notNull().default(''),
  scheduleDate: text('schedule_date').notNull().default(''),
  scheduleTime: text('schedule_time').notNull().default(''),
  notes: text('notes').notNull().default(''),
  // Comma-separated tags (e.g. "vc,priority-a,seo"). Cheap to filter via LIKE.
  tags: text('tags').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({
  byUser:        index('contacts_user_idx').on(t.userId),
  byEmail:       index('contacts_email_idx').on(t.userId, t.recruiterEmail),
  byStatus:      index('contacts_status_idx').on(t.userId, t.status),
  byEmailStatus: index('contacts_email_status_idx').on(t.userId, t.emailStatus),
}))

export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),       // stable slug, unique per user
  label: text('label').notNull().default(''),
  category: text('category').notNull().default(''),
  subject: text('subject').notNull().default(''),
  // Optional second subject for 50/50 A/B testing — empty = no split.
  subjectB: text('subject_b').notNull().default(''),
  initialMsg: text('initial_msg').notNull().default(''),
  follow1Msg: text('follow1_msg').notNull().default(''),
  lastFollowMsg: text('last_follow_msg').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(false),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({
  byUserKey: index('templates_user_key_idx').on(t.userId, t.key),
}))

export const drafts = sqliteTable('drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),
  plainBody: text('plain_body').notNull().default(''),
  status: text('status').notNull().default('draft'), // draft|sent
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({ byUser: index('drafts_user_idx').on(t.userId, t.status) }))

export const emailLog = sqliteTable('email_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  scheduleId: text('schedule_id').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull().default(''),
  scheduledAt: integer('scheduled_at').notNull(),
  status: text('status').notNull().default('Scheduled'), // Scheduled|Retrying|Sent|Failed|Cancelled
  attempts: integer('attempts').notNull().default(0),
  lastResult: text('last_result').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({ byUserStatus: index('email_log_user_status_idx').on(t.userId, t.status) }))

export const settings = sqliteTable('settings', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull().default(''),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.key] }) }))

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  ip: text('ip').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({ byUser: index('audit_user_idx').on(t.userId) }))

export const blocklist = sqliteTable('blocklist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // null = global
  pattern: text('pattern').notNull(),
  type: text('type').notNull().default('email'), // email|domain
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({ byUser: index('blocklist_user_idx').on(t.userId) }))

// ── New tables for v2 features ─────────────────────────────────────────
export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'), // draft|active|paused|archived
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export const campaignSteps = sqliteTable('campaign_steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  templateId: integer('template_id').references(() => templates.id, { onDelete: 'set null' }),
  delayHours: integer('delay_hours').notNull().default(48),
  stopOnReply: integer('stop_on_reply', { mode: 'boolean' }).notNull().default(true),
})

export const campaignEnrollments = sqliteTable('campaign_enrollments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  currentStep: integer('current_step').notNull().default(0),
  nextRunAt: integer('next_run_at').notNull(),
  status: text('status').notNull().default('active'), // active|completed|stopped|replied
}, (t) => ({
  byNext: index('enr_next_idx').on(t.status, t.nextRunAt),
  // A contact can only be in a given campaign once. Guards a race where
  // two concurrent enroll() calls both pass the "already enrolled?" check.
  uqCampaignContact: uniqueIndex('enr_unique_idx').on(t.campaignId, t.contactId),
}))

// Analytics events — fact table for the dashboard.
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  templateId: integer('template_id').references(() => templates.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(), // sent|open|click|reply|bounce|unsubscribe
  meta: text('meta').notNull().default(''), // free-form JSON
  ts: integer('ts').notNull().$defaultFn(() => Date.now()),
}, (t) => ({ byUserKindTs: index('events_user_kind_ts_idx').on(t.userId, t.kind, t.ts) }))

// Per-user API tokens for the JSON API at /api/v1/*. We store SHA-256 of the
// raw key; the plaintext is shown once at creation and never again.
export const apiKeys = sqliteTable('api_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  prefix: text('prefix').notNull(), // first 8 chars of the raw key, for UI display
  // Comma-separated scope list. Empty = "all" (back-compat for pre-0004
  // keys). Routes call requireScopes() to enforce per-endpoint requirements.
  // See lib/bearer-auth.ts for the scope catalog.
  scopes: text('scopes').notNull().default(''),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({
  byUser: index('api_keys_user_idx').on(t.userId),
  byHash: uniqueIndex('api_keys_hash_idx').on(t.keyHash),
}))

// B1 — per-user company enrichment. Linked to contacts.company by name
// (case-insensitive match in the service layer; no FK because the
// contacts.company column is free-text user input).
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  industry: text('industry').notNull().default(''),
  hq: text('hq').notNull().default(''),
  size: text('size').notNull().default(''),
  funding: text('funding').notNull().default(''),
  glassdoor: text('glassdoor').notNull().default(''),
  techStack: text('tech_stack').notNull().default(''),
  salaryRange: text('salary_range').notNull().default(''),
  hiringFreq: text('hiring_freq').notNull().default(''),
  notes: text('notes').notNull().default(''),
  sourceUrl: text('source_url').notNull().default(''),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
}, (t) => ({
  byUser: index('companies_user_idx').on(t.userId),
  byUserName: uniqueIndex('companies_user_name_idx').on(t.userId, t.name),
}))

// Multiple per-user from-addresses (Personal vs Work vs Role-targeted).
// SMTP password is encrypted at rest via lib/crypto.ts. The legacy
// single per-user SMTP in settings.SMTP_* is preserved as the
// implicit "default" identity for back-compat.
export const emailIdentities = sqliteTable('email_identities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  fromName: text('from_name').notNull().default(''),
  fromEmail: text('from_email').notNull(),
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull().default(587),
  smtpUser: text('smtp_user').notNull(),
  smtpPassEnc: text('smtp_pass_enc').notNull().default(''),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
}, (t) => ({
  byUser: index('email_identities_user_idx').on(t.userId),
}))

// A/B variants per campaign step. Scheduler reads these; if a step has
// rows, splits enrollments by hash(contactId) % weight-sum. Empty falls
// back to campaignSteps.templateId so existing campaigns keep working.
export const campaignStepVariants = sqliteTable('campaign_step_variants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stepId: integer('step_id').notNull().references(() => campaignSteps.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').references(() => templates.id, { onDelete: 'set null' }),
  weight: integer('weight').notNull().default(1),
  label: text('label').notNull().default(''),
}, (t) => ({
  byStep: index('campaign_step_variants_step_idx').on(t.stepId),
}))

// One row per user holding the most recent SSE/poll progress event.
// Sits in its own table (not `settings`) so high-frequency emit() writes
// during a bulk import don't contend with config reads. PRIMARY KEY on
// userId means emit() can do a clean upsert without coordinating
// queue chains in app code. See migration 0005_progress_events.
export const progressEvents = sqliteTable('progress_events', {
  userId: text('user_id').primaryKey().notNull().references(() => users.id, { onDelete: 'cascade' }),
  at: integer('at').notNull(),
  payload: text('payload').notNull(),
})

// Saved views on /contacts. A "view" is a named bundle of filters the
// user uses repeatedly (e.g. "Hot leads — LinkedIn — Bangalore"). The
// `filters` blob is a JSON snapshot of the URLSearchParams keys the
// contacts page reads (search/tag/status/company/location/platform).
export const savedViews = sqliteTable('saved_views', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(), // 'contacts' today; expansion-ready for other lists
  name: text('name').notNull(),
  filters: text('filters').notNull(), // JSON
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({
  byUserScope: index('saved_views_user_scope_idx').on(t.userId, t.scope),
}))

// Outbound webhooks. `events` is a comma-separated kind list ("sent,open,click,…").
export const webhooks = sqliteTable('webhooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secret: text('secret').notNull(), // for HMAC signing of payloads
  events: text('events').notNull().default('sent,open,click,reply,bounce,unsubscribe'),
  lastStatus: integer('last_status'),
  lastDeliveryAt: integer('last_delivery_at', { mode: 'timestamp_ms' }),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({ byUser: index('webhooks_user_idx').on(t.userId) }))

// Job tracker — user-supplied tracked job-board / careers URLs. The
// fetcher periodically pulls each URL via the SSRF-defended fetcher,
// AI-extracts visible job titles, and persists new ones as `jobLeads`.
// Per-user; tenancy enforced via userId on both tables.
export const jobSources = sqliteTable('job_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Free-form label the user picks ("Notion careers", "LinkedIn — PM in BLR").
  label: text('label').notNull(),
  url: text('url').notNull(),
  // Comma-separated keywords; new leads matching at least one are kept.
  // Empty = keep everything the AI sees.
  keywords: text('keywords').notNull().default(''),
  // Last fetch timestamp + status for the UI.
  lastFetchedAt: integer('last_fetched_at'),
  lastStatus: text('last_status').notNull().default(''),
  lastError: text('last_error').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => ({
  byUser:   index('job_sources_user_idx').on(t.userId),
  byActive: index('job_sources_active_idx').on(t.active, t.userId),
}))

export const jobLeads = sqliteTable('job_leads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceId: integer('source_id').notNull().references(() => jobSources.id, { onDelete: 'cascade' }),
  // Normalized for dedupe — lowercased title + sourceId. A unique index
  // guarantees we never re-insert the same lead from the same source.
  fingerprint: text('fingerprint').notNull(),
  title: text('title').notNull(),
  company: text('company').notNull().default(''),
  link: text('link').notNull().default(''),
  location: text('location').notNull().default(''),
  status: text('status').notNull().default('new'), // new|saved|ignored|applied
  notes: text('notes').notNull().default(''),
  seenAt: integer('seen_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  // Added in migration 0009
  postedAt: integer('posted_at', { mode: 'timestamp_ms' }),
  salary: text('salary').notNull().default(''),
  description: text('description').notNull().default(''),
}, (t) => ({
  byUser:        index('job_leads_user_idx').on(t.userId, t.status, t.seenAt),
  uqFingerprint: uniqueIndex('job_leads_fingerprint_idx').on(t.sourceId, t.fingerprint),
  bySource:      index('job_leads_source_idx').on(t.sourceId),
  byUserSource:  index('job_leads_user_source_idx').on(t.userId, t.sourceId),
  // Covers pruneOldLeads scan: WHERE status IN (...) AND seen_at < cutoff.
  byStatusSeen:  index('job_leads_status_seen_idx').on(t.status, t.seenAt),
}))

export type JobSource = typeof jobSources.$inferSelect
export type JobLead = typeof jobLeads.$inferSelect
export type SavedView = typeof savedViews.$inferSelect
export type User = typeof users.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type Webhook = typeof webhooks.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type Template = typeof templates.$inferSelect
export type Draft = typeof drafts.$inferSelect
export type EmailLogRow = typeof emailLog.$inferSelect
export type Campaign = typeof campaigns.$inferSelect
export type Event = typeof events.$inferSelect
// (apiKeys / webhooks types are declared next to the table definitions above
//  in the same file — duplicated here so the export block stays grouped.)
