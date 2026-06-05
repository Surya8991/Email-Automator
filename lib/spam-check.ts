// Pre-flight spam-trigger lint. Heuristic check that runs locally
// (no API call) on the editor body + subject before send. Catches the
// common patterns that score on SpamAssassin / Apple Mail filters
// without claiming to be a full filter.
//
// Surfaces as a warning chip in the editor. The user can still send
// — this is informational, not a block.

export interface SpamCheckResult {
  /** 0 = clean, higher = more concerning. Bands: 0-2 ok, 3-5 mild, 6+ loud. */
  score: number
  /** Distinct rule names that fired, useful for the UI to chip each one. */
  hits: Array<{ rule: string; description: string; weight: number }>
}

const RULES: Array<{ rule: string; description: string; weight: number; test: (subject: string, body: string) => boolean }> = [
  {
    rule: 'ALL_CAPS_SUBJECT',
    description: 'Subject is mostly UPPERCASE — reads as shouting.',
    weight: 3,
    test: (s) => {
      // Letters-only ratio of uppercase. Empty / short subjects skipped.
      const letters = s.replace(/[^a-zA-Z]/g, '')
      if (letters.length < 8) return false
      const upper = letters.replace(/[^A-Z]/g, '').length
      return upper / letters.length > 0.6
    },
  },
  {
    rule: 'EXCESSIVE_EXCLAMATION',
    description: 'More than 3 exclamation marks across subject + body.',
    weight: 2,
    test: (s, b) => (s + b).split('!').length - 1 > 3,
  },
  {
    rule: 'CLASSIC_SPAM_WORDS',
    description: 'Body uses classic spam triggers (FREE!, GUARANTEED, ACT NOW, etc.).',
    weight: 3,
    test: (_s, b) => {
      // Case-insensitive substring match against a small curated list. The
      // list is the lowest-hanging fruit; longer SpamAssassin lists exist
      // but most of those flag false-positives in legit outreach.
      const triggers = [
        'free!', 'guaranteed', 'act now', 'limited time', 'no obligation',
        'risk free', 'cash bonus', 'click here now', '100% free',
        'work from home', 'lose weight', 'viagra', 'casino',
      ]
      const lower = b.toLowerCase()
      return triggers.some((t) => lower.includes(t))
    },
  },
  {
    rule: 'URL_HEAVY',
    description: 'Body contains 4+ links — tight outreach should have one CTA at most.',
    weight: 2,
    test: (_s, b) => (b.match(/https?:\/\/[^\s"'<>]+/g) ?? []).length >= 4,
  },
  {
    rule: 'MISSING_BODY',
    description: 'Body is shorter than 40 characters — recipients will think it\'s a phishing test.',
    weight: 2,
    test: (_s, b) => stripHtmlInline(b).trim().length < 40,
  },
  {
    rule: 'MISSING_PERSONALIZATION',
    description: 'Body uses no {{variables}} — same generic copy goes to everyone.',
    weight: 2,
    test: (_s, b) => !/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/.test(b),
  },
  {
    rule: 'SUSPICIOUS_TLD',
    description: 'Body links a "free" TLD (.tk / .top / .xyz / .click) — spam filters down-rank these.',
    weight: 2,
    test: (_s, b) => /\bhttps?:\/\/[^\s"'<>]+\.(?:tk|top|xyz|click|gq|ml|cf)\b/i.test(b),
  },
  {
    rule: 'CURRENCY_SHOUT',
    description: 'Body uses $$$ or €€€ — classic spam stylization.',
    weight: 2,
    test: (_s, b) => /[\$€£¥]{3,}/.test(b),
  },
  {
    rule: 'NO_UNSUB_LINK',
    description: 'No unsubscribe link in body — required for bulk send to comply with CAN-SPAM / GDPR.',
    weight: 1,
    test: (_s, b) => !/unsubscribe/i.test(b),
  },
]

function stripHtmlInline(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ')
}

/**
 * Run all rules against (subject, body) and return the aggregate
 * score + list of triggered rules. Pure function; safe to call on
 * every keystroke.
 */
export function checkSpamRisk(subject: string, body: string): SpamCheckResult {
  const hits: SpamCheckResult['hits'] = []
  let score = 0
  for (const r of RULES) {
    if (r.test(subject, body)) {
      hits.push({ rule: r.rule, description: r.description, weight: r.weight })
      score += r.weight
    }
  }
  return { score, hits }
}

/**
 * Bucket helper for the UI — turns the raw score into a band the chip
 * styling can switch on.
 */
export function spamRiskBand(score: number): 'clean' | 'mild' | 'loud' {
  if (score <= 2) return 'clean'
  if (score <= 5) return 'mild'
  return 'loud'
}
