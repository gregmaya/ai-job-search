import { BASE_URL, OFFER_BASE, htmlFetch, parseJobDetail, stripInvisible, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a full offer URL or a bare numeric ID. */
function normalizeUrl(input: string): string | null {
  if (/^\d{6,}$/.test(input)) return `${OFFER_BASE}/oferta-${input}`
  if (input.startsWith(`${BASE_URL}/co/ofertas-trabajo/`) && /-\d{6,}(?:[/?#]|$)/.test(input)) {
    return input.split(/[?#]/)[0]
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const url = normalizeUrl(opts.id)
  if (!url) {
    writeError(`Could not parse an elempleo offer ID or URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(url)
    const job = html ? stripInvisible(parseJobDetail(html, url)) : null
    if (!job) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Posted: ${job.date}` : "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
