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
