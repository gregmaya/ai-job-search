import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.js"

interface SearchOutput {
  meta: { count: number; page: number }
  results: { id: string; title: string; url: string; company: string | null; location: string | null; date: string | null }[]
}

// Skipped in CI so a push never scripts requests against a portal whose terms prohibit them.
describe.skipIf(!!process.env.CI)("live search", () => {
  test("returns populated results", async () => {
    const out = parseJSON<SearchOutput>(await runCLI(["search", "-q", "analista de datos", "--limit", "3"]))
    expect(out.meta.count).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toMatch(/^[0-9A-Fa-f]{32}$/)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.url).toContain("co.computrabajo.com/ofertas-de-trabajo/")
    }
  })
})

describe("flag validation", () => {
  const expectError = async (args: string[], code: string) => {
    const r = await runCLI(args)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe(code)
  }

  test("missing query", () => expectError(["search"], "NO_QUERY"))
  test("bogus flag", () => expectError(["search", "-q", "x", "--bogus", "y"], "UNKNOWN_FLAG"))
  test("non-numeric page", () => expectError(["search", "-q", "x", "--page", "two"], "BAD_ARG"))
  test("detail with no id", () => expectError(["detail"], "NO_ID"))
  test("detail with a foreign URL", () => expectError(["detail", "https://example.com/x-1234567"], "BAD_ID"))
})
