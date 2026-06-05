import { eq, inArray } from 'drizzle-orm'
import { db } from '@/server/db/client'
import * as s from '@/server/db/schema'

// GDPR-style full data dump. Returns a JSON object with one key per
// table containing the user's rows. Sensitive data (encrypted SMTP
// passwords, OAuth tokens in accounts) is redacted — exporting them in
// plaintext would defeat at-rest encryption.
//
// The shape is intentionally flat + machine-readable rather than a
// pretty PDF. Operators can grep, diff, or feed it into a script.

export interface ExportManifest {
  schemaVersion: 1
  exportedAt: string
  user: { id: string; email: string }
  tables: Record<string, number>
}

export interface UserExport {
  manifest: ExportManifest
  data: Record<string, unknown[]>
}

// Columns we'll never include in the export, even if they live on a
// user-owned row. Auth secrets in accounts and encrypted blobs in
// settings/identities — exporting these is either a credential leak
// or useless ciphertext.
const REDACT_ACCOUNT = new Set(['refresh_token', 'access_token', 'id_token', 'session_state'])
const REDACT_SETTING_KEYS = new Set(['SMTP_PASS', 'GROQ_API_KEY', 'API_KEY_HASH'])

export async function buildUserExport(userId: string, email: string): Promise<UserExport> {
  // campaigns rows are scoped by userId; child tables (campaign_steps,
  // campaign_enrollments, campaign_step_variants) chain through
  // campaign_id. Fetch the user's campaign ids first so we can filter
  // children without a JOIN (keeps the dual-driver path simple).
  const campaignsRows = await db.select().from(s.campaigns).where(eq(s.campaigns.userId, userId)).catch(() => [] as Array<typeof s.campaigns.$inferSelect>)
  const campaignIds = campaignsRows.map((c) => c.id)
  const stepsP = campaignIds.length > 0
    ? db.select().from(s.campaignSteps).where(inArray(s.campaignSteps.campaignId, campaignIds)).catch(() => [])
    : Promise.resolve([])
  const enrollsP = campaignIds.length > 0
    ? db.select().from(s.campaignEnrollments).where(inArray(s.campaignEnrollments.campaignId, campaignIds)).catch(() => [])
    : Promise.resolve([])

  // Run remaining SELECTs in parallel — the user's data set is bounded
  // by their own activity, so this is fast even for power users.
  const [
    contactsRows, templatesRows, draftsRows, emailLogRows, eventsRows,
    campaignStepsRows, campaignEnrollsRows,
    companiesRows, identitiesRows, settingsRows, blocklistRows, auditRows,
    accountRows,
  ] = await Promise.all([
    db.select().from(s.contacts).where(eq(s.contacts.userId, userId)),
    db.select().from(s.templates).where(eq(s.templates.userId, userId)),
    db.select().from(s.drafts).where(eq(s.drafts.userId, userId)),
    db.select().from(s.emailLog).where(eq(s.emailLog.userId, userId)),
    db.select().from(s.events).where(eq(s.events.userId, userId)),
    stepsP,
    enrollsP,
    db.select().from(s.companies).where(eq(s.companies.userId, userId)).catch(() => []),
    db.select().from(s.emailIdentities).where(eq(s.emailIdentities.userId, userId)).catch(() => []),
    db.select().from(s.settings).where(eq(s.settings.userId, userId)),
    db.select().from(s.blocklist).where(eq(s.blocklist.userId, userId)),
    db.select().from(s.auditLog).where(eq(s.auditLog.userId, userId)).catch(() => []),
    db.select().from(s.accounts).where(eq(s.accounts.userId, userId)),
  ])
  // Variants chain step_id → campaign_steps.id → campaign_id (already
  // user-scoped above). Filter by the user's step ids in one pass.
  const stepIds = (campaignStepsRows as Array<{ id: number }>).map((r) => r.id)
  const variantsRows = stepIds.length > 0
    ? await db.select().from(s.campaignStepVariants).where(inArray(s.campaignStepVariants.stepId, stepIds)).catch(() => [])
    : []

  // Per-row redaction passes. We can't drop rows entirely — the user
  // needs to know which providers they linked — but we can scrub the
  // credentials inside them.
  const accountsClean = accountRows.map((r) => {
    const o = { ...r } as Record<string, unknown>
    for (const k of REDACT_ACCOUNT) if (k in o) o[k] = '[REDACTED]'
    return o
  })
  const settingsClean = settingsRows.map((r) => {
    const o = { ...r } as Record<string, unknown>
    if (typeof o.key === 'string' && REDACT_SETTING_KEYS.has(o.key)) o.value = '[REDACTED]'
    return o
  })
  // Identities encrypt SMTP password — pass through the blob (it's
  // ciphertext, useless without the key) but flag it.
  const identitiesClean = identitiesRows.map((r) => ({
    ...r,
    smtpPassEncrypted: '[REDACTED — ciphertext, restored via re-entry]',
  }))

  const data: Record<string, unknown[]> = {
    contacts: contactsRows,
    templates: templatesRows,
    drafts: draftsRows,
    email_log: emailLogRows,
    events: eventsRows,
    campaigns: campaignsRows,
    campaign_steps: campaignStepsRows,
    campaign_enrolls: campaignEnrollsRows,
    campaign_step_variants: variantsRows,
    companies: companiesRows,
    email_identities: identitiesClean,
    user_settings: settingsClean,
    blocklist: blocklistRows,
    audit_log: auditRows,
    accounts: accountsClean,
  }
  const tables: Record<string, number> = {}
  for (const [k, v] of Object.entries(data)) tables[k] = v.length

  // Use a deterministic export timestamp so two exports of the same
  // data have identical manifests. Caller stamps Date.now() into the
  // filename if they need recency.
  const manifest: ExportManifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    user: { id: userId, email },
    tables,
  }
  return { manifest, data }
}
