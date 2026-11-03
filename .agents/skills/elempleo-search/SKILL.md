---
name: elempleo-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Colombia on
  elempleo.com, or look up a specific elempleo posting. Covers Bogotá, Medellín,
  Cali, Barranquilla and the rest of Colombia. Trigger phrases: elempleo, jobs in
  Colombia, jobs in Bogotá, Colombian job search, find work in Colombia, empleo en
  Colombia, ofertas de empleo, ofertas de trabajo, vacantes, buscar trabajo, trabajo
  en Bogotá, empleo en Bogotá, empleo en Medellín, vacantes en Colombia.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/elempleo-search/cli/src/cli.ts *)
---

# elempleo Search Skill

Search live job listings from [elempleo.com](https://www.elempleo.com), a Colombian job portal, using its public pages. No authentication, no API key and **zero runtime dependencies**.

## ⚠️ Personal use only

elempleo's terms authorise use of the site "únicamente para su uso personal y no comercial" (only for personal, non-commercial use). Use this for your own job search, keep volume low, and do not use it commercially or for bulk data collection. You run it on your own responsibility.

## When to use

- Search for jobs in Colombia by keyword and city
- Read the full description and deadline of an elempleo posting

## Commands

Run from the repo root.

### search

```bash
bun run .agents/skills/elempleo-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

| Flag | Meaning |
|------|---------|
| `--query`, `-q` | Keywords, best in Spanish. **Required.** |
| `--location`, `-l` | Colombian city, e.g. `"Bogotá"`. Default: nationwide. |
| `--jobage <days>` | Keep postings up to N days old. Applied client-side to the current page, because the public pages have no date filter. |
| `--page <n>` | 1-indexed page, 20 results per page. Default 1. |
| `--limit`, `-n` | Cap results emitted, client-side. |
| `--format` | `json` (default), `table` or `plain`. |

### detail

```bash
bun run .agents/skills/elempleo-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Returns the full description plus posting date, deadline, employment type and salary where published.

## Examples

```bash
# GIS tools named in postings (the most precise geospatial searches)
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "arcgis" --format table
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "qgis" --format table

# Geospatial roles nationwide
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "geoespacial" --format table

# Data roles in Bogotá from the last two weeks
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "cientifico de datos" -l "Bogotá" --jobage 14 --format table

# Roles in Medellín
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "analista de datos" -l "Medellín" --format table

# Second page
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "analista de datos" -l "Bogotá" --page 2 --format table

# Full posting
bun run .agents/skills/elempleo-search/cli/src/cli.ts detail 1886773463 --format plain
```

## Output

| Format | Use |
|--------|-----|
| `json` | `{ "meta": { "count", "page", "total" }, "results": [...] }`. Each result has `id`, `title`, `company`, `location`, `date`, `dateText`, `salary`, `tags` and `url`; missing values are `null`. |
| `table` | Quick scan in the terminal. |
| `plain` | Readable text. |

Errors go to stderr as `{ "error": "...", "code": "..." }` with exit code 1.

## Notes

- **"SIG" is ambiguous in Colombia.** It usually means *Sistema Integrado de Gestión* (quality, safety and management systems), not GIS. `arcgis`, `qgis` and `geoespacial` are the most precise searches. `gis` and `sistemas de informacion geografica` are noisy: the portal matches them loosely and returned drivers and cleaning staff.
- **Keyword matching is broad.** The portal expands queries, and `ingeniero de transporte` returned automotive mechanics. Check titles and descriptions before treating a hit as relevant.
- **Search dates are estimates.** Cards show only relative ages, so `date` is derived from `dateText`. `detail` returns the exact `datePosted` and deadline.
- **Results are newest first**, so `--jobage` on page 1 catches the most recent postings. Check page 2 for broad queries.
- **Many employers are confidential**, shown as `Empresa confidencial` in search and `CONFIDENTIAL` in detail.
