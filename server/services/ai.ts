import { getAiFor } from './credentials'

// Groq's OpenAI-compatible /chat/completions endpoint via fetch — no extra
// SDK dep. Credentials are per-user (Settings → AI) with env fallback.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export type Tone = 'professional' | 'friendly' | 'concise' | 'enthusiastic' | 'formal'
const TONE_HINTS: Record<Tone, string> = {
  professional: 'Tone: warm professional. Polished but human.',
  friendly:     'Tone: friendly, conversational. Use a first-name greeting.',
  concise:      'Tone: punchy and direct — under 80 words. No filler.',
  enthusiastic: 'Tone: energetic and curious. Convey genuine interest.',
  formal:       'Tone: traditional business. Salutation "Dear …", sign-off "Best regards".',
}

function systemPrompt(tone: Tone): string {
  return `You write short, ${tone} job-application outreach emails.
${TONE_HINTS[tone]}
Output ONLY the email body in HTML (no <html>/<head>/<body> wrapper).
Use <p> for paragraphs. Personalize sparingly using ONLY the variables
the caller provides. Never invent facts about the recipient.
Keep it under 150 words unless the tone explicitly says otherwise.`
}

async function groqJson(userId: string, body: Record<string, unknown>): Promise<unknown> {
  const creds = await getAiFor(userId)
  if (creds.source === 'none') throw new Error('Groq API key not set (Settings → AI)')
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.apiKey}` },
    body: JSON.stringify({ model: creds.model, ...body }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${text.slice(0, 240)}`)
  }
  return res.json()
}

export interface DraftOpts {
  goal: string
  tone?: Tone
  signature?: string
  vars?: Record<string, string>
  existing?: string
}

export async function draftEmail(userId: string, opts: DraftOpts): Promise<string> {
  const tone = opts.tone ?? 'professional'
  const userText =
    (opts.existing ? `Improve this draft, keeping the same intent:\n\n${opts.existing}\n\n` : `Write a new outreach email.\n\n`) +
    `Goal: ${opts.goal}\n` +
    (opts.vars ? `Available variables: ${Object.keys(opts.vars).map((k) => `{{${k}}}`).join(', ')}\n` : '') +
    (opts.signature ? `Append this signature verbatim: ${opts.signature}\n` : '')

  const data = await groqJson(userId, {
    temperature: 0.7,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt(tone) },
      { role: 'user', content: userText },
    ],
  }) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Groq returned an empty response')
  return content
}

/**
 * AI-enrich a company name with best-effort guesses for the research
 * fields (industry, HQ, size, etc.). Output is structured JSON the
 * Companies form can spread directly. Values are model-derived, so the
 * UI should mark this as "AI guess — verify before saving".
 */
export interface CompanyEnrichment {
  industry?: string; hq?: string; size?: string; funding?: string
  glassdoor?: string; techStack?: string; salaryRange?: string
  hiringFreq?: string; notes?: string; sourceUrl?: string
}

export async function enrichCompany(userId: string, name: string): Promise<CompanyEnrichment> {
  const data = await groqJson(userId, {
    temperature: 0.4,
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a research assistant. Return ONLY JSON with these optional keys: ' +
          'industry, hq, size, funding, glassdoor, techStack, salaryRange, hiringFreq, notes. ' +
          'No prose, no markdown. Leave keys out when you genuinely do not know — DO NOT fabricate. ' +
          'Values must be short (under 120 chars each). techStack is comma-separated. ' +
          'salaryRange is a single range like "₹40-60L" or "$120-180k".',
      },
      { role: 'user', content: `Research the company: ${name}. Respond in JSON.` },
    ],
  }) as { choices?: Array<{ message?: { content?: string } }> }
  const txt = data.choices?.[0]?.message?.content ?? '{}'
  try {
    const parsed = JSON.parse(txt) as CompanyEnrichment
    // Defensive clamp — model can return arrays / objects despite the
    // instructions. Stringify anything non-string per field; clip length.
    const out: CompanyEnrichment = {}
    for (const k of ['industry', 'hq', 'size', 'funding', 'glassdoor', 'techStack', 'salaryRange', 'hiringFreq', 'notes'] as const) {
      const v = parsed[k]
      if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 480)
    }
    return out
  } catch {
    return {}
  }
}

/**
 * AI personalization: short, recipient-aware opening line for an outreach
 * email. Given a contact's name/role/company and a goal, returns a single
 * sentence the user can paste into the template.
 */
export async function suggestOpener(
  userId: string,
  contact: { name?: string; role?: string; company?: string; notes?: string },
  goal: string,
): Promise<string> {
  const data = await groqJson(userId, {
    temperature: 0.7,
    max_tokens: 120,
    messages: [
      {
        role: 'system',
        content:
          'Write ONE short opening sentence (under 25 words) for a cold outreach email. ' +
          'Avoid clichés ("I hope this finds you well"). Reference the recipient only with facts ' +
          'I provide — do not invent. No greeting like "Hi [name]" — just the body opener. No quotes.',
      },
      {
        role: 'user',
        content:
          `Contact: ${contact.name ?? '(unknown)'}` +
          (contact.role ? `, ${contact.role}` : '') +
          (contact.company ? ` at ${contact.company}` : '') +
          (contact.notes ? `. Notes: ${contact.notes}` : '') +
          `\nGoal: ${goal}`,
      },
    ],
  }) as { choices?: Array<{ message?: { content?: string } }> }
  return (data.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '')
}

/** Generate N short subject-line variants for a given topic. */
export async function suggestSubjects(userId: string, topic: string, n = 5): Promise<string[]> {
  const data = await groqJson(userId, {
    temperature: 0.9,
    max_tokens: 256,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Return ONLY JSON of the form {"subjects": ["...", "..."]} — no prose. Each subject under 60 chars. No emoji. No ALL CAPS.',
      },
      { role: 'user', content: `Give me ${n} subject-line variants for: ${topic}` },
    ],
  }) as { choices?: Array<{ message?: { content?: string } }> }
  const txt = data.choices?.[0]?.message?.content ?? '{}'
  try {
    const parsed = JSON.parse(txt) as { subjects?: unknown } | unknown[]
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string').slice(0, n)
    if (parsed && typeof parsed === 'object' && 'subjects' in parsed && Array.isArray((parsed as { subjects: unknown }).subjects)) {
      return ((parsed as { subjects: unknown[] }).subjects).filter((x): x is string => typeof x === 'string').slice(0, n)
    }
  } catch { /* fall through */ }
  return []
}
