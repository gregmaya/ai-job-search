// Data source: co.computrabajo.com's public, server-rendered search and offer
// pages. No authentication.
//
// Personal use only. Computrabajo's legal terms prohibit scripts and "Robot/Crawler"
// copying, so keep volume low and do not use this commercially or for bulk collection.

export const BASE_URL = "https://co.computrabajo.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; computrabajo-cli/1.0)"

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
  date: string | null // estimated YYYY-MM-DD; the portal shows relative dates
  dateText: string | null // the portal's own wording, e.g. "Hace 2 días"
  salary: string | null
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  dateText: string | null
  salary: string | null
  employmentType: string | null
  schedule: string | null
  requirements: string[]
  description: string | null
  url: string
}

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

function cleanDescription(html: string): string {
  return decodeHtmlEntities(
    visibleHtml(html)
      .replace(/\r\n?/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

export function slugify(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** The portal's Bogotá slug is "bogota-dc"; other cities and departments are plain. */
function citySlug(location: string): string {
  const slug = slugify(location)
  return slug === "bogota" || slug === "bogota-d-c" ? "bogota-dc" : slug
}

export function buildSearchUrl(query: string, location: string | undefined, page: number): string {
  const city = location ? `-en-${citySlug(location)}` : ""
  const pager = page > 1 ? `?p=${page}` : ""
  return `${BASE_URL}/trabajo-de-${slugify(query)}${city}${pager}`
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const DAY_MS = 86_400_000

/**
 * Posting age in days from the portal's wording: "Hace 58 minutos", "Ayer",
 * "Hace 4 días", "Más de 30 días", or an absolute "14 de octubre" with no year. Null if unrecognised.
 */
export function postedAgeDays(text: string, now: Date = new Date()): number | null {
  const t = stripAccents(text).toLowerCase().trim()
  if (/\bhoy\b|\bhora|\bminuto|\bmomento/.test(t)) return 0
  if (/\bayer\b/.test(t)) return 1
  const rel = t.match(/hace\s+(\d+|un|una)\s+(dia|semana|mes)/)
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? parseInt(rel[1], 10) : 1
    return n * { dia: 1, semana: 7, mes: 30 }[rel[2] as "dia" | "semana" | "mes"]
  }
  const older = t.match(/mas de (\d+) dias?/)
  if (older) return parseInt(older[1], 10)
  const abs = t.match(/(\d{1,2})\s+de\s+([a-z]+)/)
  const month = abs ? MONTHS.indexOf(abs[2]) : -1
  if (!abs || month < 0) return null
  let when = Date.UTC(now.getUTCFullYear(), month, parseInt(abs[1], 10))
  if (when > now.getTime()) when = Date.UTC(now.getUTCFullYear() - 1, month, parseInt(abs[1], 10))
  return Math.floor((now.getTime() - when) / DAY_MS)
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10)
}

/** Bogotá renders as "Bogotá, D.C., Bogotá, D.C."; keep one copy. */
function dedupeLocation(text: string): string | null {
  const half = (text.length - 2) / 2
  const repeated = Number.isInteger(half) && text.slice(0, half) === text.slice(half + 2)
  return (repeated ? text.slice(0, half) : text) || null
}

/** Split on each offer card and parse every chunk on its own. */
export function parseJobCards(html: string, now: Date = new Date()): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()

  for (const chunk of html.split(/<article\b/).slice(1)) {
    const id = chunk.match(/data-id=['"]([0-9A-Fa-f]{32})['"]/)?.[1]
    if (!id || seen.has(id)) continue
    const link = chunk.match(/class="js-o-link[^"]*"\s+href="([^"#]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/)
    if (!link) continue
    const title = clean(link[2])
    if (!title) continue

    const named = chunk.match(/offer-grid-article-company-url[^>]*>([\s\S]*?)<\/a>/)?.[1]
    const plain = chunk.match(/<p class="dFlex vm_fx fs16 fc_base mt5">([\s\S]*?)<\/p>/)?.[1]
    const location = chunk.match(/<span class="mr10">([\s\S]*?)<\/span>/)?.[1]
    const salary = chunk.match(/i_salary"><\/span>([\s\S]*?)<\/span>/)?.[1]
    const posted = chunk.match(/<p class="fs13 fc_aux mt15">([\s\S]*?)<\/p>/)?.[1]
    const dateText = posted ? clean(posted) || null : null
    const age = dateText ? postedAgeDays(dateText, now) : null

    seen.add(id)
    results.push({
      id,
      title,
      company: clean(named ?? plain ?? "") || null,
      location: location ? dedupeLocation(clean(location)) : null,
      date: age === null ? null : isoDaysAgo(age, now),
      dateText,
      salary: salary ? clean(salary) || null : null,
      url: `${BASE_URL}${link[1]}`,
    })
  }
  return results
}

/** Parse an offer page. Its JSON-LD has no JobPosting, so the markup is the source. */
export function parseJobDetail(html: string, url: string, now: Date = new Date()): JobDetail | null {
  const title = html.match(/<h1[^>]*box_detail[^>]*>([\s\S]*?)<\/h1>/)?.[1]
  if (!title) return null

  const start = html.indexOf('div-link="oferta"')
  const block = start === -1 ? "" : html.slice(start)
  const tags = [...block.matchAll(/<span class="tag base[^"]*">([\s\S]*?)<\/span>/g)].map((m) => clean(m[1]))
  const salary = tags.find((t) => t.includes("$")) ?? null
  const employmentType = tags.find((t) => /contrato/i.test(t)) ?? null
  const schedule = tags.find((t) => /tiempo|horas|parcial|turno/i.test(t)) ?? null

  const body = block.match(/<p class="mbB">([\s\S]*?)<\/p>/)?.[1]
  const reqList = block.match(/Requerimientos<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? ""
  const requirements = [...reqList.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1]))
  const posted = block.match(/<p class="fc_aux fs13">([\s\S]*?)<\/p>/)?.[1]
  const dateText = posted ? clean(posted) || null : null
  const age = dateText ? postedAgeDays(dateText, now) : null

  const header = html.match(/box_detail[\s\S]{0,400}?<p class="fs16">([\s\S]*?)<\/p>/)?.[1]
  const parts = header ? clean(header).split(/\s+-\s+/) : []

  return {
    id: url.match(/([0-9A-Fa-f]{32})/)?.[1] ?? "",
    title: clean(title),
    company: parts.length > 1 ? parts.slice(0, -1).join(" - ") : null,
    location: parts.length ? dedupeLocation(parts[parts.length - 1]) : null,
    date: age === null ? null : isoDaysAgo(age, now),
    dateText,
    salary,
    employmentType,
    schedule,
    requirements,
    description: body ? cleanDescription(body) : null,
    url,
  }
}
