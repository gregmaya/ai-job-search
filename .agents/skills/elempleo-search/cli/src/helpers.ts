// Data source: elempleo.com's public, server-rendered search and offer pages.
// No authentication. Its /co/api/joboffers/* endpoints need an anti-forgery
// token tied to a browser session, so the CLI stays on the public GET pages.

export const BASE_URL = "https://www.elempleo.com"
export const SEARCH_BASE = `${BASE_URL}/co/ofertas-empleo`
export const OFFER_BASE = `${BASE_URL}/co/ofertas-trabajo`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; elempleo-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CO,es;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // estimated YYYY-MM-DD; the portal shows relative dates only
  dateText: string | null // the portal's own wording, e.g. "Hace 1 mes"
  salary: string | null
  tags: string | null
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  deadline: string | null
  employmentType: string | null
  salary: string | null
  description: string | null
  url: string
}

/** Convert a Unicode code point to a string, dropping out-of-range values. */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

/**
 * Characters a reader of the posting never sees but a model reading this
 * output does: C0/C1 controls other than tab, newline and carriage return, the
 * soft hyphen, bidi marks/embeddings/overrides/isolates, zero-width characters
 * and invisible operators, the BOM, variation selectors, and Unicode tag
 * characters (U+E0000-E007F), which can spell out a whole hidden instruction.
 * Listing text is third-party data, and these arrive raw in a portal's JSON or
 * markup as easily as through a numeric entity.
 */
const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁯︀-️﻿\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

/** Strip INVISIBLE_CHARS from every string in a result, recursively: the CLI's output boundary. */
export function stripInvisible<T>(value: T): T {
  if (typeof value === "string") return value.replace(INVISIBLE_CHARS, "") as T
  if (Array.isArray(value)) return value.map(stripInvisible) as T
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripInvisible(v)])) as T
  }
  return value
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Whether an opening tag's attributes keep it from rendering: `hidden`, or an inline style that hides it. */
function isHiddenTag(attrs: string): boolean {
  for (const m of attrs.matchAll(/([^\s"'=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ""
    if (name === "hidden") return true
    if (name === "style" && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)\b/i.test(value)) {
      return true
    }
  }
  return false
}

/**
 * Drop markup a browser never renders - comments (including Word's
 * conditional ones), <script>/<style>/<template> blocks, and elements marked
 * hidden - before tags are stripped. A plain tag strip keeps their text, which
 * hands the model words the posting's reader never saw. CSS-only tricks
 * (off-screen, zero font size) need a renderer and are not caught here.
 */
export function visibleHtml(html: string): string {
  const src = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
  // One pass, collecting what is kept: slicing the string per hidden element
  // would make a page full of them quadratic.
  const open = /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/g
  const kept: string[] = []
  let from = 0
  let m: RegExpExecArray | null
  while ((m = open.exec(src)) !== null) {
    if (!m[2] || !isHiddenTag(m[2])) continue
    const tag = m[1].toLowerCase()
    let end = open.lastIndex
    if (!VOID_TAGS.has(tag) && !m[0].endsWith("/>")) {
      // Skip to the matching close tag, counting nested same-name elements. An
      // unclosed hidden element runs to the end: failing closed drops visible
      // text, failing open would leak the hidden text.
      const same = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
      same.lastIndex = end
      end = src.length
      let depth = 1
      let s: RegExpExecArray | null
      while ((s = same.exec(src)) !== null) {
        if (s[1]) depth--
        else if (!s[0].endsWith("/>")) depth++
        if (depth === 0) {
          end = same.lastIndex
          break
        }
      }
    }
    kept.push(src.slice(from, m.index))
    from = end
    open.lastIndex = end
  }
  kept.push(src.slice(from))
  return kept.join("")
}

function clean(html: string): string {
  return decodeHtmlEntities(visibleHtml(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/** Keep paragraph breaks when a description arrives as HTML or with \r\n. */
export function cleanDescription(text: string): string {
  return decodeHtmlEntities(
    visibleHtml(text)
      .replace(/\r\n?/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** "Bogotá D.C." -> "bogota-d-c": elempleo's path segments are accent-free kebab-case. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildSearchUrl(query: string, location: string | undefined, page: number): string {
  const parts = [`trabajo-${slugify(query)}`]
  if (location) parts.push(slugify(location))
  if (page > 1) parts.push(String(page))
  return `${SEARCH_BASE}/${parts.join("/")}`
}

/** The portal shows only relative ages. Returns the age in days, or null if unrecognised. */
export function relativeAgeDays(text: string): number | null {
  const t = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
  if (/\bhoy\b|\bhora|\bminuto|\bmomento/.test(t)) return 0
  if (/\bayer\b/.test(t)) return 1
  const m = t.match(/(\d+|un|una)\s+(dia|semana|mes|ano)/)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1
  return n * { dia: 1, semana: 7, mes: 30, ano: 365 }[m[2] as "dia" | "semana" | "mes" | "ano"]
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Parse a search page. Split on the card wrapper and parse each chunk on its own,
 * so one malformed card cannot break the rest. Handlebars templates and ad slots
 * carry no numeric offer URL, so they fall out at the URL check.
 */
export function parseJobCards(html: string, now: Date = new Date()): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/class="[^"]*js-area-bind[^"]*"/).slice(1)

  for (const chunk of chunks) {
    const urlMatch = chunk.match(/^[^>]*data-url="(\/co\/ofertas-trabajo\/[^"]*?-(\d{6,}))"/)
    if (!urlMatch) continue
    const [, path, id] = urlMatch
    if (seen.has(id)) continue

    let data: Record<string, unknown> = {}
    const ga4 = chunk.match(/data-ga4-offerdata="([^"]*)"/)
    if (ga4) {
      try {
        data = JSON.parse(decodeHtmlEntities(ga4[1]))
      } catch {
        data = {} // fall back to the visible markup below
      }
    }
    const text = (key: string): string | null => {
      const v = data[key]
      return typeof v === "string" && v.trim() ? v.trim() : null
    }

    const title =
      text("title") ?? clean(chunk.match(/js-offer-title[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "")
    if (!title) continue
    const company =
      text("company") ??
      (clean(chunk.match(/js-offer-company[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "") || null)
    const location =
      text("location") ??
      (clean(chunk.match(/js-offer-city[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "") || null)

    const dateText = clean(chunk.match(/js-offer-date[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "") || null
    const age = dateText ? relativeAgeDays(dateText) : null

    seen.add(id)
    results.push({
      id,
      title,
      company,
      location,
      date: age === null ? null : isoDaysAgo(age, now),
      dateText,
      salary: text("salary"),
      tags: text("tags"),
      url: `${BASE_URL}${path}`,
    })
  }
  return results
}

/** Total hits for the query, read from the page's pagination config. */
export function parseTotal(html: string): number | null {
  const m = html.match(/data-pagination="([^"]*)"/)
  if (!m) return null
  const total = decodeHtmlEntities(m[1]).match(/"totalRecords":(\d+)/)
  return total ? parseInt(total[1], 10) : null
}

function firstString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null
  if (Array.isArray(v)) return firstString(v[0])
  return null
}

/** The portal emits unpadded dates ("2026-9-28"); the contract is YYYY-MM-DD. */
export function padDate(value: string | null): string | null {
  const m = value?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : value
}

function findJobPosting(html: string): Record<string, any> | null {
  const blocks = html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1])
      const items = Array.isArray(parsed) ? parsed : [parsed]
      const job = items.find((x) => x?.["@type"] === "JobPosting")
      if (job) return job
    } catch {
      // Skip a malformed block; another block may hold the posting.
    }
  }
  return null
}

/** Parse an offer page, which carries a schema.org JobPosting block. */
export function parseJobDetail(html: string, url: string): JobDetail | null {
  const id = url.match(/-(\d{6,})(?:[/?#]|$)/)?.[1] ?? ""
  const job = findJobPosting(html)
  const pick = (re: RegExp): string | null => {
    const m = html.match(re)
    return m ? clean(m[1]) || null : null
  }
  const title = firstString(job?.title) ?? pick(/js-jobOffer-title[^>]*>([\s\S]*?)<\/span>/)
  if (!title) return null

  const place = Array.isArray(job?.jobLocation) ? job?.jobLocation[0] : job?.jobLocation
  const salary = job?.baseSalary?.value
  const rawDescription = firstString(job?.description)
  return {
    id,
    title: decodeHtmlEntities(title),
    company: firstString(job?.hiringOrganization?.name),
    location: firstString(place?.address?.addressLocality),
    date: padDate(firstString(job?.datePosted)),
    deadline: padDate(firstString(job?.validThrough)),
    employmentType: firstString(job?.employmentType),
    salary:
      salary?.minValue !== undefined
        ? `${salary.minValue}-${salary.maxValue ?? ""} ${job?.baseSalary?.currency ?? ""}`.trim()
        : null,
    description: rawDescription ? cleanDescription(rawDescription) : null,
    url,
  }
}
