#!/usr/bin/env bun
// Self-contained CLI for searching Colombian jobs on elempleo.com's public pages.
// No external CLI framework, so it runs anywhere `bun` is available.
//
// Personal, non-commercial use only: elempleo's terms authorise use of the site
// "únicamente para su uso personal y no comercial". Keep volume low.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `elempleo-cli — search jobs on elempleo.com (Colombia)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords in Spanish. REQUIRED.
  --location, -l <text>   Colombian city, e.g. "Bogotá", "Medellín", "Cali". Default: nationwide.
  --jobage <days>         Keep postings up to N days old. Applied client-side to the current page.
  --page <n>              1-indexed page (20 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "geoespacial" --format table
  bun run src/cli.ts search -q "ingeniero de transporte" -l "Bogotá" --jobage 14 --format table
  bun run src/cli.ts detail 1886773463 --format plain

Personal, non-commercial use only (elempleo terms). Keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["location", "query", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // A discarded filter changes what the search returns with no error, so unknown
  // flags are rejected rather than ignored.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(`unknown flag --${key} for '${cmd}'; see --help for the supported flags`, "UNKNOWN_FLAG")
    }
  }

  if (cmd === "search") {
    if (typeof flags.query !== "string" || !flags.query.trim()) {
      return fail('the --query/-q flag is required (e.g. -q "geoespacial")', "NO_QUERY")
    }
    if (flags.location !== undefined && typeof flags.location !== "string") {
      return fail('--location needs a value (e.g. -l "Bogotá")', "BAD_ARG")
    }
    const numbers: Record<string, number | undefined> = {}
    for (const name of ["jobage", "page", "limit"]) {
      if (flags[name] === undefined) continue
      const val = parseInt(flags[name] as string, 10)
      if (isNaN(val)) return fail(`--${name} must be a number, got "${flags[name]}"`, "BAD_ARG")
      numbers[name] = val
    }
    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query: flags.query,
      location: flags.location,
      jobage: numbers.jobage,
      page: Math.max(1, numbers.page ?? 1),
      limit: numbers.limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const opts: DetailOpts = {
      id,
      format: (flags.format === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
