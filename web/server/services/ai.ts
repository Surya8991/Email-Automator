import { getAiFor } from './credentials'

// Groq's OpenAI-compatible /chat/completions endpoint, hit via fetch — no
// extra SDK dependency. Credentials are per-user (Settings → AI) with env
// fallback.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM = `You write short, warm, professional job-application outreach emails.
Output ONLY the email body in HTML (no <html>/<head>/<body> wrapper).
Use <p> for paragraphs. Personalize sparingly using ONLY the variables
the caller provides. Never invent facts about the recipient.
Keep it under 150 words.`

export async function draftEmail(userId: string, opts: {
  goal: string
  signature?: string
  vars?: Record<string, string>
  existing?: string
}): Promise<string> {
  const creds = await getAiFor(userId)
  if (creds.source === 'none') throw new Error('Groq API key not set (Settings → AI)')

  const userText =
    (opts.existing ? `Improve this draft, keeping the same intent:\n\n${opts.existing}\n\n` : `Write a new outreach email.\n\n`) +
    `Goal: ${opts.goal}\n` +
    (opts.vars ? `Available variables: ${Object.keys(opts.vars).map((k) => `{{${k}}}`).join(', ')}\n` : '') +
    (opts.signature ? `Append this signature verbatim: ${opts.signature}\n` : '')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.apiKey}` },
    body: JSON.stringify({
      model: creds.model,
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
