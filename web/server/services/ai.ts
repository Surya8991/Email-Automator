import { env } from '@/lib/env'

// Groq exposes an OpenAI-compatible /chat/completions endpoint, so we hit
// it with plain fetch — no extra SDK dependency. Default model is fast and
// good-enough for outreach copy (free tier covers light usage).
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM = `You write short, warm, professional job-application outreach emails.
Output ONLY the email body in HTML (no <html>/<head>/<body> wrapper).
Use <p> for paragraphs. Personalize sparingly using ONLY the variables
the caller provides. Never invent facts about the recipient.
Keep it under 150 words.`

export async function draftEmail(opts: {
  goal: string
  signature?: string
  vars?: Record<string, string>
  existing?: string
}): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set')

  const userText =
    (opts.existing ? `Improve this draft, keeping the same intent:\n\n${opts.existing}\n\n` : `Write a new outreach email.\n\n`) +
    `Goal: ${opts.goal}\n` +
    (opts.vars ? `Available variables: ${Object.keys(opts.vars).map((k) => `{{${k}}}`).join(', ')}\n` : '') +
    (opts.signature ? `Append this signature verbatim: ${opts.signature}\n` : '')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      temperature: 0.7,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userText },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${body.slice(0, 240)}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Groq returned an empty response')
  return content
}

// Generate two alternative subject lines for A/B testing.
export async function suggestSubjects(topic: string, n = 3): Promise<string[]> {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set')
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      temperature: 0.9,
      max_tokens: 256,
      messages: [
        { role: 'system', content: 'Return ONLY a JSON array of strings — no prose.' },
        { role: 'user', content: `Give me ${n} short (under 60 chars) subject-line variants for: ${topic}` },
      ],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const txt = data.choices?.[0]?.message?.content ?? '[]'
  try {
    const parsed = JSON.parse(txt) as unknown
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
    if (parsed && typeof parsed === 'object') {
      const vals = Object.values(parsed as Record<string, unknown>)
      if (vals.length === 1 && Array.isArray(vals[0])) return (vals[0] as unknown[]).filter((x): x is string => typeof x === 'string')
    }
  } catch { /* fall through */ }
  return []
}
