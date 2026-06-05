/**
 * Tiny pluralize helper used across every page header / pill / empty
 * state so "1 drafts" / "1 contacts" never ships again.
 *
 * Why a custom one and not `pluralize` from npm: we don't need full
 * lemmatization. Two shapes cover 99% of our copy:
 *
 *   pluralize(1, 'draft')               -> "1 draft"
 *   pluralize(2, 'draft')               -> "2 drafts"
 *   pluralize(1, 'company', 'companies') -> "1 company"
 *   pluralize(2, 'company', 'companies') -> "2 companies"
 *
 * Returns "<n> <word>". Pair with `Intl.NumberFormat` for large
 * counts when needed (e.g. "1,234 contacts").
 */
export function pluralize(n: number, singular: string, plural?: string): string {
  const word = n === 1 ? singular : (plural ?? `${singular}s`)
  return `${n} ${word}`
}

/**
 * Same idea but returns just the word — for cases where the count
 * lives in a separate element (e.g. a big stat number and a small
 * label underneath).
 */
export function pluralWord(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`)
}

/**
 * Format a count + word with Intl-localized thousands separators.
 * Use for any number that can plausibly exceed 1,000 (contacts,
 * sends, events).
 */
const NF = new Intl.NumberFormat('en-US')
export function formatCount(n: number, singular: string, plural?: string): string {
  const word = n === 1 ? singular : (plural ?? `${singular}s`)
  return `${NF.format(n)} ${word}`
}
