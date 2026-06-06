import { getAiFor } from './credentials'
import { getSetting } from './settings'

// ── AI generation from arbitrary context (JD, post, URL, free text) ──
//
// Returns a full subject + HTML body draft the user can accept or
// refine. Wraps Groq with a stricter system prompt + structured JSON
// output for reliability, then post-processes for safety.
//
// Why a separate service from ai.ts: this one composes multiple
// quality controls (recipient context, brand voice, length, CTA),
// and adds the URL fetcher (which has SSRF risk and needs its own
// guards). Keeping it isolated makes the security boundary obvious.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export type GenerateKind = 'jd' | 'post' | 'url' | 'text'
export type OutputLength = 'short' | 'medium' | 'long'
export type CtaEmphasis = 'none' | 'soft' | 'direct'

export interface GenerateInput {
  kind: GenerateKind
  /** Raw input. For url, the URL string; for others, the text/markdown. */
  input: string
  /**
   * Optional per-recipient context — name / role / company / notes.
   * If provided, the AI personalizes the draft specifically for them
   * instead of writing generically.
   */
  recipient?: {
    name?: string
    role?: string
    company?: string
    notes?: string
  }
  /** Length cue passed to the model. */
  length?: OutputLength
  /** Soft cue for CTA strength. */
  cta?: CtaEmphasis
  /** "What I want from this email" — overrides default goal cue. */
  goal?: string
}

export interface GeneratedDraft {
  subject: string
  /** HTML body, ready to drop into the template body field. */
  html: string
  /**
   * One-line note explaining the model's framing — useful for the UI
   * to render under "What the AI assumed" so the user can correct.
   */
  reasoning: string
  /** True if the source was fetched via URL (so the UI can attribute). */
  fromUrl?: boolean
}

const LENGTH_HINT: Record<OutputLength, string> = {
  short:  'Length: under 80 words. Punchy and direct.',
  medium: 'Length: 120–180 words. Clear paragraphs.',
  long:   'Length: 220–300 words. Two to three short paragraphs.',
}
const CTA_HINT: Record<CtaEmphasis, string> = {
  none:   'No explicit ask. Curiosity-led.',
  soft:   'Soft CTA: ask for a quick reply if they\'re open to a conversation.',
  direct: 'Direct CTA: ask for a specific next step (a 15-min call, a reply by Friday, etc.).',
}

const KIND_PREFACE: Record<GenerateKind, string> = {
  jd:   'The user pasted a job description. Use it to understand the role + company context. Write an outreach email pitching the user as a candidate.',
  post: 'The user pasted social media post content. Use it as a hook — reference the substance of the post in the opening line. Do NOT just say "I saw your post" — react to the content.',
  url:  'The user shared a URL. The fetched page content is below. Use it as context; don\'t repeat it back at length.',
  text: 'The user pasted free-form context. Use it as the brief for the email.',
}

// ── URL fetcher (SSRF-defended) ─────────────────────────────────────

const MAX_BYTES = 3_000_000  // 3 MB cap — large job boards need more
const FETCH_TIMEOUT_MS = 10_000
const ALLOWED_CONTENT_TYPES = [
  'text/html', 'text/plain', 'application/xhtml+xml', 'text/markdown', 'application/json',
]

// Block private / link-local / loopback ranges so a malicious URL can't
// pivot to internal services (Redis, metadata endpoints, etc.). Run after
// DNS resolution; before fetch.
function isPrivateIp(host: string): boolean {
  // IPv4 literal — fast path.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true          // link-local + AWS/GCP metadata
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    return false
  }
  // IPv6 — block loopback ::1 and unique-local fc00::/7. We don't
  // resolve full v6 ranges; conservative bail on anything that looks
  // private.
  if (host === '::1') return true
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  // Hostnames that resolve internally — common DNS rebinding traps.
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  return false
}

export type FetchResult = { ok: true; text: string; truncated: boolean } | { ok: false; error: string }

/**
 * Cheap URL shape + SSRF validator. Returns the cleaned URL (with
 * credentials stripped) on success; an error string on rejection.
 * Used by call sites that only want to validate a URL for later
 * fetching — e.g. job-tracker addSource, which saves the URL but
 * leaves the actual HTTP fetch for the cron tick.
 *
 * This DOES NOT perform a fetch. It blocks the same SSRF surface as
 * fetchForAi (private IPs, loopback, link-local, *.localhost etc).
 * Boards that 403 our default UA still pass validation here — the
 * cron records the HTTP error on the source row so the user can fix
 * the URL without being blocked at add-time.
 */
export function validateUrlForFetch(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL
  try { u = new URL(rawUrl.trim()) } catch { return { ok: false, error: 'Invalid URL' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) URLs are supported' }
  }
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && u.protocol !== 'https:') {
    return { ok: false, error: 'Only https URLs accepted in production' }
  }
  if (isPrivateIp(u.hostname)) {
    return { ok: false, error: 'URL points at an internal / private host' }
  }
  u.username = ''
  u.password = ''
  return { ok: true, url: u.toString() }
}

/**
 * Fetch a user-supplied URL with SSRF defenses, body cap, and content-
 * type guard. Returns the page body as plain text (HTML tags stripped)
 * so it can be safely passed into the AI prompt.
 */
export async function fetchForAi(rawUrl: string): Promise<FetchResult> {
  let u: URL
  try { u = new URL(rawUrl.trim()) } catch { return { ok: false, error: 'Invalid URL' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) URLs are supported' }
  }
  // HTTPS-only for production (HTTP is allowed in dev so local pages
  // can be tested via http://localhost — but isPrivateIp() catches that
  // anyway). On Vercel, both NODE_ENV=production and VERCEL are set.
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && u.protocol !== 'https:') {
    return { ok: false, error: 'Only https URLs accepted in production' }
  }
  if (isPrivateIp(u.hostname)) {
    return { ok: false, error: 'URL points at an internal / private host' }
  }
  // Strip user/password to avoid logging them anywhere downstream.
  u.username = ''
  u.password = ''

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const ctype = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!ALLOWED_CONTENT_TYPES.some((t) => ctype.startsWith(t))) {
      return { ok: false, error: `Unsupported content-type: ${ctype || '(none)'}` }
    }
    // Cap bytes — large pages truncate at MAX_BYTES.
    const reader = res.body?.getReader()
    if (!reader) return { ok: false, error: 'Empty response body' }
    let received = 0
    const chunks: Uint8Array[] = []
    let truncated = false
    while (received < MAX_BYTES) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        const room = MAX_BYTES - received
        if (value.byteLength > room) {
          chunks.push(value.subarray(0, room))
          received += room
          truncated = true
          break
        }
        chunks.push(value)
        received += value.byteLength
      }
    }
    const buf = new Uint8Array(received)
    let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.byteLength }
    const raw = new TextDecoder('utf-8').decode(buf)
    const text = stripHtml(raw).slice(0, 30_000)
    return { ok: true, text, truncated }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, error: 'Timed out' }
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'Fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Strip HTML tags + scripts + styles, collapse whitespace. Conservative
 * regex pass — good enough for "extract the text-ish content of a JD
 * or post page" without pulling in a parser dep.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/(p|div|li|h\d|br|tr|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Prompt builder ──────────────────────────────────────────────────

/**
 * Build the system + user messages Groq receives. Exposed for testing
 * — the test suite calls this directly to verify brand voice, recipient
 * context, length, and CTA all land in the messages when set, and are
 * cleanly omitted when blank.
 */
export function buildMessages(
  brief: GenerateInput,
  sourceText: string,
  brandVoice: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const length = brief.length ?? 'medium'
  const cta = brief.cta ?? 'soft'
  const system =
    'You write cold-outreach emails. Output ONLY a JSON object of the shape\n' +
    '{"subject":"…","html":"…","reasoning":"…"}\n' +
    'where html is the email body in HTML (paragraphs with <p>; no <html>/<head>/<body>) and\n' +
    'reasoning is one sentence explaining your framing assumption (e.g. "Treated this as a\n' +
    'Senior PM role at a Series B startup"). Subject under 80 chars. No emoji. No ALL CAPS.\n' +
    `${LENGTH_HINT[length]}\n${CTA_HINT[cta]}\n` +
    'Never invent facts about the recipient — only use facts the caller provided.\n' +
    'When personalizing, prefer {{name}} / {{company}} variables rather than hard-coded text\n' +
    'so the same draft can be reused across recipients.'

  const userParts: string[] = []
  userParts.push(KIND_PREFACE[brief.kind])
  if (brief.goal) userParts.push(`Goal: ${brief.goal}`)

  if (brandVoice.trim()) {
    userParts.push(
      '\nWriting samples from the user — match this voice (cadence, sentence length, vocabulary):\n' +
      brandVoice.trim().slice(0, 2_400),
    )
  }

  if (brief.recipient && (brief.recipient.name || brief.recipient.role || brief.recipient.company)) {
    const r = brief.recipient
    userParts.push(
      '\nRecipient context (use ONLY these facts):\n' +
      `- Name: ${r.name ?? '(unknown)'}\n` +
      (r.role ? `- Role: ${r.role}\n` : '') +
      (r.company ? `- Company: ${r.company}\n` : '') +
      (r.notes ? `- Notes: ${r.notes.slice(0, 300)}\n` : ''),
    )
  }

  userParts.push(
    `\nSource (kind=${brief.kind}):\n${sourceText.slice(0, 8_000)}`,
    '\nReturn ONLY the JSON object. No markdown fences.',
  )

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n') },
  ]
}

// ── Public entry point ──────────────────────────────────────────────

/**
 * Generate a subject + body draft from a brief.
 *
 * For kind='url' the input is fetched first via the SSRF-defended
 * fetcher; for everything else the input string is used directly.
 */
export async function generateFromContext(
  userId: string,
  brief: GenerateInput,
): Promise<GeneratedDraft> {
  const creds = await getAiFor(userId)
  if (creds.source === 'none') throw new Error('Groq API key not set (Settings → AI)')

  // Pull brand voice samples once — empty string when unset; the
  // prompt builder cleanly omits the section in that case.
  const brandVoice = await getSetting(userId, 'AI_VOICE_SAMPLES').catch(() => '')

  let sourceText = brief.input
  let fromUrl = false
  if (brief.kind === 'url') {
    const r = await fetchForAi(brief.input)
    if (!r.ok) throw new Error(`Could not fetch URL: ${r.error}`)
    sourceText = r.text
    fromUrl = true
    if (sourceText.trim().length < 80) {
      throw new Error('Fetched page had too little content to draft from')
    }
  }
  if (!sourceText || sourceText.trim().length < 12) {
    throw new Error('Input is too short — paste more context.')
  }

  const messages = buildMessages(brief, sourceText, brandVoice || '')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.apiKey}` },
    body: JSON.stringify({
      model: creds.model,
      temperature: 0.65,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${text.slice(0, 240)}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const txt = data.choices?.[0]?.message?.content?.trim() ?? '{}'
  try {
    const parsed = JSON.parse(txt) as Partial<GeneratedDraft>
    const subject = typeof parsed.subject === 'string' ? parsed.subject.slice(0, 280) : ''
    const html = typeof parsed.html === 'string' ? parsed.html : ''
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 280) : ''
    if (!subject || !html) throw new Error('AI returned an incomplete draft')
    return { subject, html, reasoning, fromUrl }
  } catch (e) {
    throw new Error(`AI response could not be parsed: ${e instanceof Error ? e.message : 'unknown'}`)
  }
}
