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

function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function cleanDescription(html: string): string {
  return decodeHtmlEntities(
    html
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
