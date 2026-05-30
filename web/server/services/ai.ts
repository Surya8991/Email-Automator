import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

let client: Anthropic | null = null
function get(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

const SYSTEM = [
  {
    type: 'text' as const,
    text: `You write short, warm, professional job-application outreach emails. ` +
      `Output ONLY the email body in HTML (no <html>/<head>/<body> wrapper). ` +
      `Use <p> for paragraphs. Personalize sparingly using ONLY the variables ` +
      `the caller provides. Never invent facts about the recipient.`,
    cache_control: { type: 'ephemeral' as const },
  },
]

export async function draftEmail(opts: {
  goal: string
  signature?: string
  vars?: Record<string, string>
  existing?: string
}): Promise<string> {
  const c = get()
  const userText =
    (opts.existing ? `Improve this draft:\n\n${opts.existing}\n\n` : `Write a new outreach email.\n\n`) +
    `Goal: ${opts.goal}\n` +
    (opts.vars ? `Available variables: ${Object.keys(opts.vars).map(k => `{{${k}}}`).join(', ')}\n` : '') +
    (opts.signature ? `Append this signature verbatim: ${opts.signature}\n` : '')

  const res = await c.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: userText }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}
