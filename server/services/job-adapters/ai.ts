// AI fallback extractor — Groq llama-3.1-8b-instant pinned (regardless of
// the user's model setting). 70b-versatile only has 12k TPM on Groq's free
// tier — 3 HTML pages' worth — making bulk refreshes impossible. The
// 8b-instant model has 500k+ TPM at the same quality for JSON extraction.
//
// Like json-ld.ts, this adapter is invoked manually by the orchestrator as
// a last-resort fallback, not via registry iteration.

import { getAiFor } from '../credentials'
import { sanitiseLink } from './utils'
import type { RawJob } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const JOB_EXTRACT_MODEL = 'llama-3.1-8b-instant'
const JOB_EXTRACT_CHARS = 8_000
// Fallback model when the primary hits a rate limit (separate quota bucket).
const JOB_EXTRACT_FALLBACK = 'llama-3.2-1b-preview'

export async function aiExtractJobs(userId: string, sourceText: string, sourceUrl = ''): Promise<RawJob[]> {
  const creds = await getAiFor(userId)
  if (creds.source === 'none') throw new Error('No AI key configured (Settings → AI)')

  const SYSTEM_PROMPT =
    'Extract job listings from the page text. Return ONLY valid JSON:\n' +
    '{"jobs":[{"title":"…","company":"…","link":"…","location":"…","salary":"…","description":"…","posted_date":"…"}]}.\n' +
    'title is required; all other fields may be empty strings. Keep ≤50 entries.\n' +
    'posted_date: ISO date string if visible, else "". description: one-sentence summary.\n' +
    'Do NOT invent data. Skip nav/cookie/footer. If no jobs: {"jobs":[]}'

  const models = [JOB_EXTRACT_MODEL, JOB_EXTRACT_FALLBACK, creds.model].filter(Boolean)

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Page text:\n\n${sourceText.slice(0, JOB_EXTRACT_CHARS)}` },
          ],
        }),
      })

      if (res.status === 429) {
        const wait = Math.min(Number(res.headers.get('retry-after') || 20) * 1000, 30_000)
        if (attempt < 2) { await new Promise((r) => setTimeout(r, wait)); continue }
        break
      }

      if (res.status === 400) break

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`)
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const txt = data.choices?.[0]?.message?.content ?? '{}'
      try {
        const parsed = JSON.parse(txt) as {
          jobs?: Array<{ title?: unknown; company?: unknown; link?: unknown; location?: unknown; salary?: unknown; description?: unknown; posted_date?: unknown }>
        }
        if (!Array.isArray(parsed.jobs)) return []
        return parsed.jobs
          .filter((j) => typeof j.title === 'string' && (j.title as string).trim())
          .map((j) => {
            const pd = typeof j.posted_date === 'string' ? j.posted_date.trim() : ''
            let postedAt: Date | null = null
            if (pd) { const d = new Date(pd); if (!isNaN(d.getTime())) postedAt = d }
            return {
              title: String(j.title).trim().slice(0, 200),
              company: typeof j.company === 'string' ? j.company.trim().slice(0, 120) : '',
              link: typeof j.link === 'string' ? sanitiseLink(j.link, sourceUrl) : '',
              location: typeof j.location === 'string' ? j.location.trim().slice(0, 120) : '',
              salary: typeof j.salary === 'string' ? j.salary.trim().slice(0, 120) : '',
              description: typeof j.description === 'string' ? j.description.trim().slice(0, 2000) : '',
              postedAt,
            }
          })
          .slice(0, 50)
      } catch { return [] }
    }
  }
  throw new Error('All Groq models rate-limited — try again in 1 minute')
}
