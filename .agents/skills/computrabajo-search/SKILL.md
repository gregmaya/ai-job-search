---
name: computrabajo-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Colombia on
  Computrabajo (co.computrabajo.com), or look up a specific Computrabajo posting.
  Covers Bogotá, Medellín, Cali, Barranquilla and the rest of Colombia. Trigger
  phrases: Computrabajo, jobs in Colombia, jobs in Bogotá, Colombian job search,
  find work in Colombia, empleo en Colombia, ofertas de trabajo, vacantes, buscar
  trabajo, trabajo en Bogotá, empleo en Medellín, bolsa de empleo Colombia.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/computrabajo-search/cli/src/cli.ts *)
---

# Computrabajo Search Skill

Search live job listings from [Computrabajo Colombia](https://co.computrabajo.com) using its public pages. No authentication, no API key and **zero runtime dependencies**.

## ⚠️ Personal use only

**Computrabajo's terms prohibit this kind of access.** They say "No utilizar mecanismos, software o scripts en relación con la utilización del Sitio Web" (do not use mechanisms, software or scripts with the site) and expressly prohibit copying by "Robot/Crawler". Its `robots.txt` permits the search pages, but that does not change the terms.

This skill exists for the candidate's own low-volume job search. Keep volume low, do not use it commercially or for bulk data collection, and do not redistribute what it returns. You run it on your own responsibility. To stop using it, set `enabled: false` above.

## When to use

- Search for jobs in Colombia by keyword and place
- Read the full description of a Computrabajo posting

## Commands

Run from the repo root.

### search

```bash
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

| Flag | Meaning |
|------|---------|
| `--query`, `-q` | Keywords, best in Spanish. **Required.** |
| `--location`, `-l` | Colombian city or department, e.g. `"Bogotá"`, `"Antioquia"`. Default: nationwide. |
| `--jobage <days>` | Keep postings up to N days old. Applied client-side to the current page. |
| `--page <n>` | 1-indexed page, about 20 results per page. Default 1. |
| `--limit`, `-n` | Cap results emitted, client-side. |
| `--format` | `json` (default), `table` or `plain`. |

### detail

```bash
bun run .agents/skills/computrabajo-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Returns the full description plus requirements, salary, contract type and schedule where published.

## Examples

```bash
# GIS tools named in postings (the most precise geospatial searches)
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "arcgis" --format table
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "qgis" --format table

# Data roles in Bogotá from the last two weeks
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "cientifico de datos" -l "Bogotá" --jobage 14 --format table

# Roles in Medellín
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "analista de datos" -l "Medellín" --format table

# Second page
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "analista de datos" -l "Bogotá" --page 2 --format table

# Full posting
bun run .agents/skills/computrabajo-search/cli/src/cli.ts detail 5C2E4117F602F1F261373E686DCF3405 --format plain
```

## Output

| Format | Use |
|--------|-----|
| `json` | `{ "meta": { "count", "page" }, "results": [...] }`. Each result has `id`, `title`, `company`, `location`, `date`, `dateText`, `salary` and `url`; missing values are `null`. |
| `table` | Quick scan in the terminal. |
| `plain` | Readable text. |

Errors go to stderr as `{ "error": "...", "code": "..." }` with exit code 1.

## Notes

- **"SIG" is ambiguous in Colombia.** It usually means *Sistema Integrado de Gestión* (quality, safety and management systems), not GIS. Prefer `arcgis`, `qgis` or `geoespacial`.
- **Keyword matching is broad.** `arcgis` returned general environmental and construction roles. Check the description before treating a hit as relevant.
- **Results are ordered by relevance, not date**, so `--jobage` can return fewer results than `--limit`. Check page 2 for broad queries.
- **Dates are estimates.** The portal shows relative ages, so `date` is derived from `dateText`, and "actualizada" means a refreshed posting, not a new one. It publishes no deadline.
- **Many employers are unnamed**, shown as "Importante empresa del sector".
