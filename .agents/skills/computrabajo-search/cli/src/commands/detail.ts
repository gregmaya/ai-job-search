import { BASE_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a full offer URL or the 32-character hex ID. The URL slug is not checked by the portal. */
function normalizeUrl(input: string): string | null {
  if (/^[0-9A-Fa-f]{32}$/.test(input)) return `${BASE_URL}/ofertas-de-trabajo/oferta-de-trabajo-de-x-${input}`
  if (input.startsWith(`${BASE_URL}/ofertas-de-trabajo/`) && /[0-9A-Fa-f]{32}(?:[?#]|$)/.test(input)) {
    return input.split(/[?#]/)[0]
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const url = normalizeUrl(opts.id)
  if (!url) {
    writeError(`Could not parse a Computrabajo offer ID or URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(url)
    const job = html ? parseJobDetail(html, url) : null
    if (!job) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.dateText ? `Posted: ${job.dateText}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.schedule ? `Schedule: ${job.schedule}` : "",
        "",
        job.description || "(no description)",
        "",
        ...(job.requirements.length ? ["Requirements:", ...job.requirements.map((r) => `- ${r}`), ""] : []),
        `URL: ${job.url}`,
      ]
      process.stdout.write(lines.filter((l, i) => l !== "" || i > 1).join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
